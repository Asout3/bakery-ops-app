import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Save, RotateCcw, Eye, FileText, CheckCircle2, Copy, Settings2, LayoutTemplate, ScrollText } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ReceiptPreview from '../../receipts/ReceiptPreview';
import { DEFAULT_RECEIPT_SETTINGS, DEFAULT_TEMPLATE_SCHEMA, RECEIPT_STYLE_PRESETS } from '../../receipts/defaults';
import { generateClientTransactionId, generateReceiptNumber, normalizeReceiptSettings, normalizeReceiptTemplate, persistReceiptConfigCache } from '../../receipts/helpers';
import { performReceiptPrint } from '../../receipts/printService';
import './ReceiptSettings.css';

function buildPreviewSale(template, user) {
  const schema = normalizeReceiptTemplate(template || {});
  const receiptNumber = generateReceiptNumber();
  const header = schema.sections.header;
  const footer = schema.sections.footer;
  const totals = {
    subtotal: 296,
    tax: schema.sections.totals.showTax ? 35.52 : 0,
    discounts: schema.sections.totals.showDiscounts ? 10 : 0,
    serviceCharge: schema.sections.totals.showServiceCharge ? 5 : 0,
  };
  totals.total = totals.subtotal + totals.tax + totals.serviceCharge - totals.discounts;
  totals.paidAmount = totals.total;
  totals.change = 0;

  return {
    id: null,
    client_transaction_id: generateClientTransactionId(),
    receipt_number: receiptNumber,
    sale_date: new Date().toISOString(),
    payment_method: 'cash',
    cashier_name: user?.username || 'Cashier',
    status: 'completed',
    receipt_template_snapshot: schema,
    receipt_payload: {
      receipt_number: receiptNumber,
      sale_date: new Date().toISOString(),
      payment_method: 'cash',
      cashier_name: user?.username || 'Cashier',
      customer_name: 'Sample Customer',
      customer_phone: '0911 22 33 44',
      internal_ref: 'PRE-ORDER-042',
      notes: 'Pickup tomorrow at 9:00 AM\nCustomer already paid deposit.',
      header_lines: [
        header.businessName,
        header.branchName,
        header.slogan,
        header.address,
        header.phone,
        header.taxId ? `TIN: ${header.taxId}` : '',
        header.website,
        header.storeCode ? `Store: ${header.storeCode}` : '',
        header.deviceLabel ? `Terminal: ${header.deviceLabel}` : '',
      ].filter(Boolean),
      currency_code: schema.sections.transaction.currencyCode || 'ETB',
      decimals: Number(schema.sections.transaction.decimals ?? 2),
      items: [
        { product_id: 1, product_name: 'Country Bread Large', quantity: 2, unit_price: 85, subtotal: 170 },
        { product_id: 2, product_name: 'Butter Croissant', quantity: 3, unit_price: 42, subtotal: 126 },
      ],
      totals: { ...totals, balanceDue: 24 },
      footer_text: footer.footerText || '',
      legal_text: footer.legalText || '',
      qr_value: footer.showQr ? (footer.qrValue || 'https://example.com/receipt-preview') : '',
    },
  };
}

function ToggleField({ checked, label, onChange }) {
  return (
    <label className="receipt-toggle-field">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SectionCard({ icon, title, description, children, actions = null }) {
  const SectionIcon = icon;
  return (
    <section className="card receipt-settings-section">
      <div className="card-header receipt-settings-section__header">
        <div className="receipt-settings-section__title-wrap">
          <div className="receipt-settings-section__icon"><SectionIcon size={18} /></div>
          <div>
            <h3>{title}</h3>
            {description ? <p className="text-muted mb-0">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="receipt-settings-editor__toolbar">{actions}</div> : null}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

export default function ReceiptSettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_RECEIPT_SETTINGS);
  const [draftTemplate, setDraftTemplate] = useState({ id: null, name: 'Classic thermal', status: 'draft', schema: DEFAULT_TEMPLATE_SCHEMA });
  const autosaveRef = useRef(null);
  const previewSectionRef = useRef(null);

  const previewSale = useMemo(() => buildPreviewSale(draftTemplate.schema, user), [draftTemplate.schema, user]);

  const loadAdminData = useCallback(async (preferredTemplateId = null) => {
    setLoading(true);
    try {
      const response = await api.get('/sales/receipt-admin');
      const nextTemplates = response.data.templates || [];
      const nextActive = response.data.activeTemplate || nextTemplates[0] || { id: 'default', name: 'Classic thermal', schema: DEFAULT_TEMPLATE_SCHEMA };
      const mergedTemplates = nextTemplates.some((item) => item.id === nextActive.id) ? nextTemplates : [nextActive, ...nextTemplates];
      const selectedId = preferredTemplateId || nextActive.id;
      const selectedTemplate = mergedTemplates.find((item) => item.id === selectedId) || nextActive;
      setTemplates(mergedTemplates);
      setSettings(normalizeReceiptSettings(response.data.settings || {}));
      setActiveTemplateId(nextActive.id);
      setSelectedTemplateId(selectedTemplate.id);
      setDraftTemplate({ ...selectedTemplate, schema: normalizeReceiptTemplate(selectedTemplate.schema || {}) });
      persistReceiptConfigCache({ settings: response.data.settings || {}, activeTemplate: nextActive, templates: mergedTemplates });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load receipt settings.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  useEffect(() => {
    if (!draftTemplate?.id || draftTemplate.status !== 'draft') return undefined;
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      try {
        const response = await api.put(`/sales/receipt-templates/${draftTemplate.id}`, { name: draftTemplate.name, status: draftTemplate.status, schema: draftTemplate.schema });
        setTemplates((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      } catch {
        return null;
      }
    }, 900);
    return () => clearTimeout(autosaveRef.current);
  }, [draftTemplate]);

  const updateSchema = (updater) => {
    setDraftTemplate((current) => ({ ...current, schema: normalizeReceiptTemplate(updater(current.schema)) }));
  };

  const setHeaderField = (field, value) => {
    updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, [field]: value } } }));
  };

  const setFooterField = (field, value) => {
    updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, footer: { ...schema.sections.footer, [field]: value } } }));
  };

  const setTransactionField = (field, value) => {
    updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, transaction: { ...schema.sections.transaction, [field]: value } } }));
  };

  const setTotalsField = (field, value) => {
    updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, totals: { ...schema.sections.totals, [field]: value } } }));
  };

  const setItemsField = (field, value) => {
    updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, items: { ...schema.sections.items, [field]: value } } }));
  };

  const selectTemplate = (templateId) => {
    const selected = templates.find((item) => item.id === templateId);
    if (!selected) return;
    setSelectedTemplateId(templateId);
    setDraftTemplate({ ...selected, schema: normalizeReceiptTemplate(selected.schema || {}) });
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.put('/sales/receipt-settings', { settings, active_template_id: activeTemplateId });
      const activeTemplate = templates.find((item) => item.id === activeTemplateId) || draftTemplate;
      persistReceiptConfigCache({ settings, activeTemplate, templates });
      toast.success('Receipt settings saved.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save receipt settings.');
    } finally {
      setSaving(false);
    }
  };

  const createTemplate = async () => {
    try {
      const response = await api.post('/sales/receipt-templates', { name: `Template ${templates.length + 1}`, schema: DEFAULT_TEMPLATE_SCHEMA });
      const nextTemplates = [response.data, ...templates];
      setTemplates(nextTemplates);
      setSelectedTemplateId(response.data.id);
      setDraftTemplate({ ...response.data, schema: normalizeReceiptTemplate(response.data.schema || {}) });
      toast.success('Draft template created.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not create template.');
    }
  };

  const saveTemplate = async (publish = false) => {
    if (!draftTemplate?.id) return;
    setSaving(true);
    try {
      let savedTemplate;
      if (publish) {
        await api.put(`/sales/receipt-templates/${draftTemplate.id}`, {
          name: draftTemplate.name,
          status: draftTemplate.status,
          schema: draftTemplate.schema,
        });
        savedTemplate = (await api.post(`/sales/receipt-templates/${draftTemplate.id}/publish`)).data;
      } else {
        savedTemplate = (await api.put(`/sales/receipt-templates/${draftTemplate.id}`, {
          name: draftTemplate.name,
          status: draftTemplate.status,
          schema: draftTemplate.schema,
        })).data;
      }
      setTemplates((current) => current.map((item) => item.id === savedTemplate.id ? savedTemplate : item));
      setDraftTemplate({ ...savedTemplate, schema: normalizeReceiptTemplate(savedTemplate.schema || {}) });
      toast.success(publish ? 'Template published.' : 'Template saved.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const activateTemplate = async () => {
    if (!draftTemplate?.id) return;
    setSaving(true);
    try {
      const response = await api.post(`/sales/receipt-templates/${draftTemplate.id}/activate`, { settings });
      setActiveTemplateId(draftTemplate.id);
      const activeTemplate = templates.find((item) => item.id === draftTemplate.id) || draftTemplate;
      persistReceiptConfigCache({ settings: response.data.settings || settings, activeTemplate, templates });
      await loadAdminData(draftTemplate.id);
      toast.success('Template activated.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to activate template.');
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = async () => {
    if (!draftTemplate?.id) return;
    setSaving(true);
    try {
      const response = await api.post(`/sales/receipt-templates/${draftTemplate.id}/reset`);
      const savedTemplate = response.data;
      setTemplates((current) => current.map((item) => item.id === savedTemplate.id ? savedTemplate : item));
      setDraftTemplate({ ...savedTemplate, schema: normalizeReceiptTemplate(savedTemplate.schema || {}) });
      toast.success('Template reset to default.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reset template.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestPrint = async (adapterMode) => {
    if (adapterMode === 'preview') {
      previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast.success('Live preview is shown below. Update any field and the receipt refreshes instantly.');
      return;
    }

    setTesting(true);
    try {
      await performReceiptPrint({ sale: previewSale, template: draftTemplate.schema, settings, adapterMode, attemptType: 'test' });
      toast.success(adapterMode === 'fake' ? 'Fake print succeeded.' : 'Print dialog opened without a popup window.');
    } catch (error) {
      toast.error(error.message || 'Print test failed.');
    } finally {
      setTesting(false);
    }
  };

  const templateHeader = draftTemplate.schema.sections.header;
  const templateFooter = draftTemplate.schema.sections.footer;
  const templateTransaction = draftTemplate.schema.sections.transaction;
  const templateItems = draftTemplate.schema.sections.items;
  const templateTotals = draftTemplate.schema.sections.totals;
  const templateTypography = draftTemplate.schema.typography;
  const templateStatusLabel = draftTemplate.id === activeTemplateId ? 'Active template' : `${draftTemplate.status || 'draft'} template`;

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="receipt-settings-page">
      <div className="receipt-settings-shell">
        <div className="page-header receipt-settings-page__header">
          <div>
            <h2>Receipt Settings</h2>
            <p className="text-muted mb-0">A tighter, scroll-friendly workspace for editing templates, testing print behavior, and checking the live receipt preview.</p>
          </div>
          <div className="receipt-settings-page__actions">
            <button className="btn btn-outline-secondary" onClick={createTemplate}><Copy size={16} /> New Template</button>
            <button className="btn btn-primary" onClick={saveSettings} disabled={saving}><Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}</button>
          </div>
        </div>

        <SectionCard
          icon={LayoutTemplate}
          title="Templates"
          description="Pick a template to edit or create a new one. Templates stay at the top so you do not have to fight a side panel."
          actions={<span className="badge badge-light receipt-settings-status-pill">{templateStatusLabel}</span>}
        >
          <div className="receipt-template-strip">
            {templates.map((template) => (
              <button key={template.id} className={`receipt-template-card ${selectedTemplateId === template.id ? 'active' : ''}`} onClick={() => selectTemplate(template.id)}>
                <div className="receipt-template-card__title-row">
                  <strong>{template.name}</strong>
                  {template.id === activeTemplateId ? <span className="badge badge-success">Active</span> : null}
                </div>
                <div className="text-muted small">{template.status} · v{template.version}</div>
              </button>
            ))}
          </div>
        </SectionCard>

        <div className="receipt-settings-stack">
          <SectionCard
            icon={Settings2}
            title="Template setup"
            description="Basic template identity, page size, and print behavior controls."
            actions={(
              <>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => saveTemplate(false)} disabled={saving}><Save size={14} /> Save Draft</button>
                <button className="btn btn-outline-primary btn-sm" onClick={() => saveTemplate(true)} disabled={saving}><CheckCircle2 size={14} /> Publish</button>
                <button className="btn btn-outline-success btn-sm" onClick={activateTemplate} disabled={saving}><Printer size={14} /> Activate</button>
                <button className="btn btn-outline-danger btn-sm" onClick={resetTemplate} disabled={saving}><RotateCcw size={14} /> Reset</button>
              </>
            )}
          >
            <div className="receipt-form-grid receipt-form-grid--compact">
              <div className="receipt-field receipt-field--span-2">
                <label className="form-label">Template Name</label>
                <input className="form-control" value={draftTemplate.name || ''} onChange={(e) => setDraftTemplate((current) => ({ ...current, name: e.target.value }))} />
              </div>
              <div className="receipt-field">
                <label className="form-label">Style Preset</label>
                <select className="form-select" value={draftTemplate.schema.stylePreset || 'classic_thermal'} onChange={(e) => updateSchema((schema) => ({ ...schema, stylePreset: e.target.value, separatorStyle: e.target.value === 'dotted' ? 'dotted' : schema.separatorStyle }))}>
                  {RECEIPT_STYLE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                </select>
              </div>
              <div className="receipt-field">
                <label className="form-label">Paper Width</label>
                <select className="form-select" value={draftTemplate.schema.paperWidth || '80mm'} onChange={(e) => updateSchema((schema) => ({ ...schema, paperWidth: e.target.value }))}>
                  <option value="80mm">80mm</option>
                  <option value="58mm">58mm</option>
                </select>
              </div>
              <div className="receipt-field">
                <label className="form-label">Separator Style</label>
                <select className="form-select" value={draftTemplate.schema.separatorStyle || 'solid'} onChange={(e) => updateSchema((schema) => ({ ...schema, separatorStyle: e.target.value }))}>
                  <option value="solid">Solid</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>
              <div className="receipt-field">
                <label className="form-label">Print Mode</label>
                <select className="form-select" value={settings.printMode} onChange={(e) => setSettings((current) => ({ ...current, printMode: e.target.value }))}>
                  <option value="auto">Auto print after sale</option>
                  <option value="ask">Ask every time</option>
                </select>
              </div>
              <div className="receipt-field">
                <label className="form-label">Sale Adapter</label>
                <select className="form-select" value={settings.printerProfile.saleAdapter} onChange={(e) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, saleAdapter: e.target.value } }))}>
                  <option value="browser">Browser</option>
                  <option value="fake">Fake</option>
                </select>
              </div>
              <div className="receipt-field">
                <label className="form-label">Testing Adapter</label>
                <select className="form-select" value={settings.printerProfile.testingAdapter} onChange={(e) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, testingAdapter: e.target.value } }))}>
                  <option value="fake">Fake</option>
                  <option value="preview">Live preview</option>
                  <option value="pdf">Print dialog / save PDF</option>
                </select>
              </div>
              <div className="receipt-field">
                <label className="form-label">Preview Adapter</label>
                <select className="form-select" value={settings.printerProfile.previewAdapter} onChange={(e) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, previewAdapter: e.target.value } }))}>
                  <option value="preview">Live preview</option>
                  <option value="pdf">Print dialog / save PDF</option>
                  <option value="fake">Fake</option>
                </select>
              </div>
              <div className="receipt-field">
                <label className="form-label">Reprint Window (minutes)</label>
                <input type="number" min="1" className="form-control" value={settings.reprintPolicy.windowMinutes} onChange={(e) => setSettings((current) => ({ ...current, reprintPolicy: { ...current.reprintPolicy, windowMinutes: Number(e.target.value || 20) } }))} />
              </div>
              <div className="receipt-field">
                <label className="form-label">Manual Reprints Allowed</label>
                <input type="number" min="0" max="5" className="form-control" value={settings.reprintPolicy.maxManualReprints} onChange={(e) => setSettings((current) => ({ ...current, reprintPolicy: { ...current.reprintPolicy, maxManualReprints: Number(e.target.value || 2) } }))} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={ScrollText}
            title="Header and footer content"
            description="Wider text areas make it easier to type long names, addresses, and legal text without the form getting cut off."
          >
            <div className="receipt-form-grid">
              <div className="receipt-field"><label className="form-label">Business Name</label><input className="form-control" value={templateHeader.businessName || ''} onChange={(e) => setHeaderField('businessName', e.target.value)} /></div>
              <div className="receipt-field"><label className="form-label">Branch / Store Name</label><input className="form-control" value={templateHeader.branchName || ''} onChange={(e) => setHeaderField('branchName', e.target.value)} /></div>
              <div className="receipt-field"><label className="form-label">Slogan</label><input className="form-control" value={templateHeader.slogan || ''} onChange={(e) => setHeaderField('slogan', e.target.value)} /></div>
              <div className="receipt-field receipt-field--span-2"><label className="form-label">Address</label><textarea className="form-control receipt-textarea" rows="3" value={templateHeader.address || ''} onChange={(e) => setHeaderField('address', e.target.value)} /></div>
              <div className="receipt-field"><label className="form-label">Phone</label><input className="form-control" value={templateHeader.phone || ''} onChange={(e) => setHeaderField('phone', e.target.value)} /></div>
              <div className="receipt-field"><label className="form-label">Tax / TIN</label><input className="form-control" value={templateHeader.taxId || ''} onChange={(e) => setHeaderField('taxId', e.target.value)} /></div>
              <div className="receipt-field"><label className="form-label">Website</label><input className="form-control" value={templateHeader.website || ''} onChange={(e) => setHeaderField('website', e.target.value)} /></div>
              <div className="receipt-field"><label className="form-label">Store Code</label><input className="form-control" value={templateHeader.storeCode || ''} onChange={(e) => setHeaderField('storeCode', e.target.value)} /></div>
              <div className="receipt-field"><label className="form-label">Terminal Label</label><input className="form-control" value={templateHeader.deviceLabel || ''} onChange={(e) => setHeaderField('deviceLabel', e.target.value)} /></div>
              <div className="receipt-field receipt-field--span-2"><label className="form-label">Footer Text</label><textarea className="form-control receipt-textarea" rows="3" value={templateFooter.footerText || ''} onChange={(e) => setFooterField('footerText', e.target.value)} /></div>
              <div className="receipt-field receipt-field--span-2"><label className="form-label">Legal Text</label><textarea className="form-control receipt-textarea" rows="3" value={templateFooter.legalText || ''} onChange={(e) => setFooterField('legalText', e.target.value)} /></div>
              <div className="receipt-field receipt-field--span-2"><label className="form-label">QR Target URL</label><input className="form-control" value={templateFooter.qrValue || ''} onChange={(e) => setFooterField('qrValue', e.target.value)} /></div>
            </div>
          </SectionCard>

          <SectionCard
            icon={Settings2}
            title="Typography and spacing"
            description="Fine tune the receipt font, font sizes, line height, and spacing between the quantity and total columns."
          >
            <div className="receipt-form-grid receipt-form-grid--compact">
              <div className="receipt-field"><label className="form-label">Font Family</label><select className="form-select" value={templateTypography.fontFamily || 'courier'} onChange={(e) => updateSchema((schema) => ({ ...schema, typography: { ...schema.typography, fontFamily: e.target.value } }))}><option value="courier">Thermal mono</option><option value="sans">Clean sans</option><option value="serif">Classic serif</option></select></div>
              <div className="receipt-field"><label className="form-label">Base Font Size</label><input type="number" min="10" max="18" className="form-control" value={templateTypography.baseFontSize} onChange={(e) => updateSchema((schema) => ({ ...schema, typography: { ...schema.typography, baseFontSize: Number(e.target.value || 12) } }))} /></div>
              <div className="receipt-field"><label className="form-label">Business Name Size</label><input type="number" min="12" max="28" className="form-control" value={templateTypography.businessNameFontSize} onChange={(e) => updateSchema((schema) => ({ ...schema, typography: { ...schema.typography, businessNameFontSize: Number(e.target.value || 19) } }))} /></div>
              <div className="receipt-field"><label className="form-label">Meta Font Size</label><input type="number" min="10" max="18" className="form-control" value={templateTypography.metaFontSize} onChange={(e) => updateSchema((schema) => ({ ...schema, typography: { ...schema.typography, metaFontSize: Number(e.target.value || 12) } }))} /></div>
              <div className="receipt-field"><label className="form-label">Line Height</label><input type="number" min="1" max="2" step="0.05" className="form-control" value={templateTypography.lineHeight} onChange={(e) => updateSchema((schema) => ({ ...schema, typography: { ...schema.typography, lineHeight: Number(e.target.value || 1.35) } }))} /></div>
              <div className="receipt-field"><label className="form-label">Qty/Total Gap</label><input type="number" min="6" max="24" className="form-control" value={templateItems.columnGap} onChange={(e) => setItemsField('columnGap', Number(e.target.value || 12))} /></div>
              <div className="receipt-field"><label className="form-label">Qty Column Width</label><input type="number" min="36" max="72" className="form-control" value={templateItems.quantityColumnWidth} onChange={(e) => setItemsField('quantityColumnWidth', Number(e.target.value || 48))} /></div>
              <div className="receipt-field"><label className="form-label">Total Column Width</label><input type="number" min="72" max="140" className="form-control" value={templateItems.totalColumnWidth} onChange={(e) => setItemsField('totalColumnWidth', Number(e.target.value || 96))} /></div>
            </div>
          </SectionCard>

          <SectionCard
            icon={Settings2}
            title="Visible receipt fields"
            description="Turn fields on or off without digging through a wide side layout."
          >
            <div className="receipt-toggle-grid">
              <ToggleField checked={Boolean(templateTransaction.showReceiptNumber)} label="Show receipt number" onChange={(value) => setTransactionField('showReceiptNumber', value)} />
              <ToggleField checked={Boolean(templateTransaction.showDateTime)} label="Show date/time" onChange={(value) => setTransactionField('showDateTime', value)} />
              <ToggleField checked={Boolean(templateTransaction.showCashier)} label="Show cashier" onChange={(value) => setTransactionField('showCashier', value)} />
              <ToggleField checked={Boolean(templateTransaction.showPaymentMethod)} label="Show payment method" onChange={(value) => setTransactionField('showPaymentMethod', value)} />
              <ToggleField checked={Boolean(templateTransaction.showCustomerInfo)} label="Show customer info" onChange={(value) => setTransactionField('showCustomerInfo', value)} />
              <ToggleField checked={Boolean(templateTransaction.showInternalRef)} label="Show internal reference" onChange={(value) => setTransactionField('showInternalRef', value)} />
              <ToggleField checked={Boolean(templateTransaction.showNotes)} label="Show notes / pickup lines" onChange={(value) => setTransactionField('showNotes', value)} />
              <ToggleField checked={Boolean(templateTotals.showSubtotal)} label="Show subtotal" onChange={(value) => setTotalsField('showSubtotal', value)} />
              <ToggleField checked={Boolean(templateTotals.showTax)} label="Show tax" onChange={(value) => setTotalsField('showTax', value)} />
              <ToggleField checked={Boolean(templateTotals.showDiscounts)} label="Show discounts" onChange={(value) => setTotalsField('showDiscounts', value)} />
              <ToggleField checked={Boolean(templateTotals.showServiceCharge)} label="Show service charge" onChange={(value) => setTotalsField('showServiceCharge', value)} />
              <ToggleField checked={Boolean(templateTotals.showPaidAmount)} label="Show paid amount" onChange={(value) => setTotalsField('showPaidAmount', value)} />
              <ToggleField checked={Boolean(templateTotals.showChange)} label="Show change" onChange={(value) => setTotalsField('showChange', value)} />
              <ToggleField checked={Boolean(templateTotals.showBalanceDue)} label="Show remaining balance" onChange={(value) => setTotalsField('showBalanceDue', value)} />
              <ToggleField checked={Boolean(templateFooter.showQr)} label="Show QR section" onChange={(value) => setFooterField('showQr', value)} />
              <ToggleField checked={Boolean(settings.reprintPolicy.adminOverrideAfterWindow)} label="Allow admin override after window" onChange={(value) => setSettings((current) => ({ ...current, reprintPolicy: { ...current.reprintPolicy, adminOverrideAfterWindow: value } }))} />
              <ToggleField checked={Boolean(settings.printerProfile.simulateFailure)} label="Simulate printer failure" onChange={(value) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, simulateFailure: value } }))} />
            </div>
          </SectionCard>

          <SectionCard
            icon={Eye}
            title="Preview and testing"
            description="The preview is embedded on the page, and test print actions now avoid popup windows."
            actions={(
              <>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleTestPrint('preview')}><Eye size={14} /> Jump to Preview</button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleTestPrint('pdf')} disabled={testing}><FileText size={14} /> Print / Save PDF</button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleTestPrint('fake')} disabled={testing}><Printer size={14} /> Fake Print</button>
              </>
            )}
          >
            <div className="receipt-settings-testing-note">
              <strong>Tip:</strong> the live preview below updates instantly while you type, so you can test layout without opening a separate window.
            </div>
            <div className="receipt-settings-preview-wrap" ref={previewSectionRef}>
              <ReceiptPreview sale={previewSale} template={draftTemplate.schema} settings={settings} />
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

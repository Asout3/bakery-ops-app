import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Save, RotateCcw, Eye, FileText, CheckCircle2, Copy } from 'lucide-react';
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
    receipt_number: generateReceiptNumber(),
    sale_date: new Date().toISOString(),
    payment_method: 'cash',
    cashier_name: user?.username || 'Cashier',
    status: 'completed',
    receipt_template_snapshot: schema,
    receipt_payload: {
      receipt_number: generateReceiptNumber(),
      sale_date: new Date().toISOString(),
      payment_method: 'cash',
      cashier_name: user?.username || 'Cashier',
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
      totals,
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

export default function ReceiptSettingsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_RECEIPT_SETTINGS);
  const [draftTemplate, setDraftTemplate] = useState({ id: null, name: 'Classic thermal', status: 'draft', schema: DEFAULT_TEMPLATE_SCHEMA });
  const autosaveRef = useRef(null);

  const previewSale = useMemo(() => buildPreviewSale(draftTemplate.schema, user), [draftTemplate.schema, user?.username]);

  const loadAdminData = async (preferredTemplateId = null) => {
    setLoading(true);
    try {
      const response = await api.get('/sales/receipt-admin');
      const nextTemplates = response.data.templates || [];
      const nextActive = response.data.activeTemplate || nextTemplates[0] || { id: 'default', name: 'Classic thermal', schema: DEFAULT_TEMPLATE_SCHEMA };
      const selectedId = preferredTemplateId || nextActive.id;
      const selectedTemplate = nextTemplates.find((item) => item.id === selectedId) || nextActive;
      setTemplates(nextTemplates);
      setSettings(normalizeReceiptSettings(response.data.settings || {}));
      setActiveTemplateId(nextActive.id);
      setSelectedTemplateId(selectedTemplate.id);
      setDraftTemplate({ ...selectedTemplate, schema: normalizeReceiptTemplate(selectedTemplate.schema || {}) });
      persistReceiptConfigCache({ settings: response.data.settings || {}, activeTemplate: nextActive, templates: nextTemplates });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load receipt settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (!draftTemplate?.id || draftTemplate.status !== 'draft') return undefined;
    clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(async () => {
      try {
        const response = await api.put(`/sales/receipt-templates/${draftTemplate.id}`, { name: draftTemplate.name, status: draftTemplate.status, schema: draftTemplate.schema });
        setTemplates((current) => current.map((item) => item.id === response.data.id ? response.data : item));
      } catch {}
    }, 900);
    return () => clearTimeout(autosaveRef.current);
  }, [draftTemplate]);

  const updateSchema = (updater) => {
    setDraftTemplate((current) => ({ ...current, schema: normalizeReceiptTemplate(updater(current.schema)) }));
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
      persistReceiptConfigCache({ settings, activeTemplate: draftTemplate, templates });
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
      const response = await api.put(`/sales/receipt-templates/${draftTemplate.id}`, {
        name: draftTemplate.name,
        status: publish ? 'published' : draftTemplate.status,
        schema: draftTemplate.schema,
        bumpVersion: publish,
      });
      const savedTemplate = publish ? (await api.post(`/sales/receipt-templates/${draftTemplate.id}/publish`)).data : response.data;
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
      persistReceiptConfigCache({ settings: response.data.settings || settings, activeTemplate: draftTemplate, templates });
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
    try {
      await performReceiptPrint({ sale: previewSale, template: draftTemplate.schema, settings, adapterMode, attemptType: 'test' });
      toast.success(adapterMode === 'fake' ? 'Fake print succeeded.' : 'Preview opened.');
    } catch (error) {
      toast.error(error.message || 'Print test failed.');
    }
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div className="receipt-settings-page">
      <div className="page-header receipt-settings-page__header">
        <div>
          <h2>Receipt Settings</h2>
          <p className="text-muted mb-0">Thermal-first receipt templates, print controls, and preview tools that work without hardware.</p>
        </div>
        <div className="receipt-settings-page__actions">
          <button className="btn btn-outline-secondary" onClick={createTemplate}><Copy size={16} /> New Template</button>
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}><Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}</button>
        </div>
      </div>

      <div className="receipt-settings-layout">
        <aside className="card receipt-settings-sidebar">
          <div className="card-header"><h3>Templates</h3></div>
          <div className="card-body receipt-settings-sidebar__list">
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
        </aside>

        <section className="receipt-settings-editor">
          <div className="card mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3>Editor</h3>
              <div className="receipt-settings-editor__toolbar">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => saveTemplate(false)}><Save size={14} /> Save Draft</button>
                <button className="btn btn-outline-primary btn-sm" onClick={() => saveTemplate(true)}><CheckCircle2 size={14} /> Publish</button>
                <button className="btn btn-outline-success btn-sm" onClick={activateTemplate}><Printer size={14} /> Activate</button>
                <button className="btn btn-outline-danger btn-sm" onClick={resetTemplate}><RotateCcw size={14} /> Reset</button>
              </div>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-lg-4 col-md-6"><label className="form-label">Template Name</label><input className="form-control" value={draftTemplate.name || ''} onChange={(e) => setDraftTemplate((current) => ({ ...current, name: e.target.value }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Style Preset</label><select className="form-select" value={draftTemplate.schema.stylePreset || 'classic_thermal'} onChange={(e) => updateSchema((schema) => ({ ...schema, stylePreset: e.target.value, separatorStyle: e.target.value === 'dotted' ? 'dotted' : schema.separatorStyle }))}>{RECEIPT_STYLE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Paper Width</label><select className="form-select" value={draftTemplate.schema.paperWidth || '80mm'} onChange={(e) => updateSchema((schema) => ({ ...schema, paperWidth: e.target.value }))}><option value="80mm">80mm</option><option value="58mm">58mm</option></select></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Business Name</label><input className="form-control" value={draftTemplate.schema.sections.header.businessName || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, businessName: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Branch / Store Name</label><input className="form-control" value={draftTemplate.schema.sections.header.branchName || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, branchName: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Slogan</label><input className="form-control" value={draftTemplate.schema.sections.header.slogan || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, slogan: e.target.value } } }))} /></div>
                <div className="col-lg-6 col-md-6"><label className="form-label">Address</label><input className="form-control" value={draftTemplate.schema.sections.header.address || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, address: e.target.value } } }))} /></div>
                <div className="col-lg-3 col-md-6"><label className="form-label">Phone</label><input className="form-control" value={draftTemplate.schema.sections.header.phone || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, phone: e.target.value } } }))} /></div>
                <div className="col-lg-3 col-md-6"><label className="form-label">Tax / TIN</label><input className="form-control" value={draftTemplate.schema.sections.header.taxId || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, taxId: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Website</label><input className="form-control" value={draftTemplate.schema.sections.header.website || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, website: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Store Code</label><input className="form-control" value={draftTemplate.schema.sections.header.storeCode || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, storeCode: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Terminal Label</label><input className="form-control" value={draftTemplate.schema.sections.header.deviceLabel || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, header: { ...schema.sections.header, deviceLabel: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Footer Text</label><input className="form-control" value={draftTemplate.schema.sections.footer.footerText || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, footer: { ...schema.sections.footer, footerText: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Legal Text</label><input className="form-control" value={draftTemplate.schema.sections.footer.legalText || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, footer: { ...schema.sections.footer, legalText: e.target.value } } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">QR Target URL</label><input className="form-control" value={draftTemplate.schema.sections.footer.qrValue || ''} onChange={(e) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, footer: { ...schema.sections.footer, qrValue: e.target.value } } }))} /></div>
                <div className="col-lg-3 col-md-6"><label className="form-label">Separator Style</label><select className="form-select" value={draftTemplate.schema.separatorStyle || 'solid'} onChange={(e) => updateSchema((schema) => ({ ...schema, separatorStyle: e.target.value }))}><option value="solid">Solid</option><option value="dotted">Dotted</option></select></div>
                <div className="col-lg-3 col-md-6"><label className="form-label">Print Mode</label><select className="form-select" value={settings.printMode} onChange={(e) => setSettings((current) => ({ ...current, printMode: e.target.value }))}><option value="auto">Auto print after sale</option><option value="ask">Ask every time</option></select></div>
                <div className="col-lg-3 col-md-6"><label className="form-label">Sale Adapter</label><select className="form-select" value={settings.printerProfile.saleAdapter} onChange={(e) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, saleAdapter: e.target.value } }))}><option value="browser">Browser</option><option value="fake">Fake</option></select></div>
                <div className="col-lg-3 col-md-6"><label className="form-label">Testing Adapter</label><select className="form-select" value={settings.printerProfile.testingAdapter} onChange={(e) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, testingAdapter: e.target.value } }))}><option value="fake">Fake</option><option value="preview">Preview</option><option value="pdf">PDF</option></select></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Preview Adapter</label><select className="form-select" value={settings.printerProfile.previewAdapter} onChange={(e) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, previewAdapter: e.target.value } }))}><option value="preview">Preview Window</option><option value="pdf">Browser Save as PDF</option><option value="fake">Fake</option></select></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Reprint Window (minutes)</label><input type="number" min="1" className="form-control" value={settings.reprintPolicy.windowMinutes} onChange={(e) => setSettings((current) => ({ ...current, reprintPolicy: { ...current.reprintPolicy, windowMinutes: Number(e.target.value || 20) } }))} /></div>
                <div className="col-lg-4 col-md-6"><label className="form-label">Manual Reprints Allowed</label><input type="number" min="0" max="5" className="form-control" value={settings.reprintPolicy.maxManualReprints} onChange={(e) => setSettings((current) => ({ ...current, reprintPolicy: { ...current.reprintPolicy, maxManualReprints: Number(e.target.value || 2) } }))} /></div>
                <div className="col-12 receipt-toggle-grid">
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.transaction.showReceiptNumber)} label="Show receipt number" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, transaction: { ...schema.sections.transaction, showReceiptNumber: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.transaction.showDateTime)} label="Show date/time" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, transaction: { ...schema.sections.transaction, showDateTime: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.transaction.showCashier)} label="Show cashier" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, transaction: { ...schema.sections.transaction, showCashier: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.transaction.showPaymentMethod)} label="Show payment method" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, transaction: { ...schema.sections.transaction, showPaymentMethod: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.totals.showSubtotal)} label="Show subtotal" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, totals: { ...schema.sections.totals, showSubtotal: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.totals.showTax)} label="Show tax" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, totals: { ...schema.sections.totals, showTax: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.totals.showDiscounts)} label="Show discounts" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, totals: { ...schema.sections.totals, showDiscounts: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.totals.showServiceCharge)} label="Show service charge" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, totals: { ...schema.sections.totals, showServiceCharge: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.totals.showPaidAmount)} label="Show paid amount" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, totals: { ...schema.sections.totals, showPaidAmount: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.totals.showChange)} label="Show change" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, totals: { ...schema.sections.totals, showChange: value } } }))} />
                  <ToggleField checked={Boolean(draftTemplate.schema.sections.footer.showQr)} label="Show QR section" onChange={(value) => updateSchema((schema) => ({ ...schema, sections: { ...schema.sections, footer: { ...schema.sections.footer, showQr: value } } }))} />
                  <ToggleField checked={Boolean(settings.reprintPolicy.adminOverrideAfterWindow)} label="Allow admin override after window" onChange={(value) => setSettings((current) => ({ ...current, reprintPolicy: { ...current.reprintPolicy, adminOverrideAfterWindow: value } }))} />
                  <ToggleField checked={Boolean(settings.printerProfile.simulateFailure)} label="Simulate printer failure" onChange={(value) => setSettings((current) => ({ ...current, printerProfile: { ...current.printerProfile, simulateFailure: value } }))} />
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h3>Preview & Testing</h3>
              <div className="receipt-settings-editor__toolbar">
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleTestPrint('preview')}><Eye size={14} /> Thermal Preview</button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleTestPrint('pdf')}><FileText size={14} /> Browser PDF</button>
                <button className="btn btn-outline-secondary btn-sm" onClick={() => handleTestPrint('fake')}><Printer size={14} /> Fake Print</button>
              </div>
            </div>
            <div className="card-body receipt-settings-preview-wrap">
              <ReceiptPreview sale={previewSale} template={draftTemplate.schema} settings={settings} />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

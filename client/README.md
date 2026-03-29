# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


## Recent UX updates

- Admin Sales page now includes a Sales/Batch Performance toggle.
- Cashier sales flow now supports grouped products with variant-selection modal.
- Admin/Manager expense pages use dynamic expense categories and show formatted expense IDs.

- Cashier pre-order form was redesigned for clearer money inputs (unit price auto-fill, live total/paid/remaining summary) and offline product dropdown continuity via cached products.
- Admin and manager order tables now provide a View Note action and larger note inputs for better operational visibility.

- Payment method options now include Telebirr in cashier/admin sales flows and pre-order payment selection.
- Manager order actions now prevent restarting already-ready pre-orders, and finalized orders are protected from further edits.

- Staff Payments UI now includes quick search + frequency filtering, a simplified pay form (removed frequency/payroll-month inputs), and improved suggested-payment readability/interactions.
- Offline sync UX now uses global toast notifications for queued actions, sync start, successful sync completion, retry states, and attention-needed outcomes.
- Cashier sales checkout footer was reworked into a clear vertical stack (Payment Method, Total, Complete Sale button) and larger product/size selectors for faster touch interaction.
- Admin sales page scroll behavior was hardened so long sales and batch-performance tables remain fully scrollable.

- Products now support expiration dates, cashier sales block expired variants, and admins have a Waste page with daily/weekly/monthly loss visibility.
- Notifications now deliver full-content in-app toasts and background browser alerts when permission is granted.
- Cashier sale screen now removes the redundant Print Mode status block and updates quantity editing so Backspace clears input without removing cart rows.
- Cashier history now supports in-window sale item quantity edits again (alongside receipt reprint), and stale local sales are no longer mixed into online history after DB migrations.
- Admin expense modal now allows category creation even when a new database starts with zero categories.
- Admin inventory view removes Add Item and Delete actions, keeping the page focused on inventory edits only.
- Manager inventory batch-cart quantity input now mirrors cashier behavior (Backspace-safe drafts + explicit Remove action for deletion).
- Manager batch edit modal now auto-closes after a successful update for faster repeated workflows.

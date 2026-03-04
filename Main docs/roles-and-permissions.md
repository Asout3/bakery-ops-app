# Roles and Permissions

This project supports three operational roles.

## Admin
- Full access to dashboards, reports, products, inventory, sales, expenses, staff management, account management, payments, notifications, and sync queue.
- Can create and disable cashier/ground-manager accounts.
- Can create, edit, disable, and delete staff profiles.
- Can update own credentials.
- Can run branch-wide/organization-wide operational oversight features.

## Ground Manager (`manager`)
- Manages inventory and batches.
- Can create, edit, and void batches only within the configured safety edit window.
- Can view manager-scoped notifications.
- Cannot access admin-only HR/account/security panels.

## Cashier (`cashier`)
- Runs sales and cashier sales history workflows.
- Can void sales only within the configured void window.
- Can view cashier-scoped data only.
- Cannot access inventory administration, reports administration, or account/staff management.

## Security and Scope Rules
- Authentication is JWT-based.
- Authorization is route-level with role guards.
- Location scope is enforced server-side where applicable.
- Sensitive operations use strict validation and consistent error contracts.

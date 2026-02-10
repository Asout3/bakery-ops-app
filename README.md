# Bakery Operations Web App

A comprehensive, role-based web application designed to streamline daily operations for small-to-mid bakeries. Manage inventory, sales, expenses, staff payments, and generate actionable reports - all from one modern, intuitive interface.

![Bakery Operations](https://img.shields.io/badge/Status-Production%20Ready-success)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

### Core Functionality
- **Role-Based Access Control**: Separate interfaces for Admin, Manager, and Cashier roles
- **Multi-Branch Switching**: Admin can switch active branch context from the top bar
- **Inventory Management**: Track baked and purchased items with real-time stock levels
- **Batch Tracking**: Ground managers can log and send inventory batches
- **Point of Sale**: Fast, intuitive sales interface for cashiers with cart functionality
- **Expense Tracking**: Comprehensive expense and staff payment management
- **Reporting & Analytics**: Daily, weekly, and monthly reports with visual charts
- **Notifications**: Low stock alerts and system notifications
- **Sync Queue Monitor**: Admin page for queued operations and retry/conflict history (`/admin/sync`)
- **Activity Logging**: Complete audit trail of all operations
- **Transactional Integrity**: Atomic sale/batch operations with rollback on failure
- **Inventory Protection**: Sales are blocked when stock is insufficient to prevent silent oversell
- **Offline Queue v2 (IndexedDB)**: Sales, batches, and expenses are queued in IndexedDB with retry/conflict history UI
- **Offline-First Design**: Local storage with background sync capability

### Technical Highlights
- **Modern Tech Stack**: React 18, Vite, Node.js, Express, PostgreSQL
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **RESTful API**: Clean, documented API endpoints
- **JWT Authentication**: Secure token-based authentication
- **Database Schema**: Optimized PostgreSQL schema with proper indexing
- **Beautiful UI**: Modern, professional interface with charts and visualizations

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd bakery-ops-app
```

2. **Set up the database**
```bash
# Create database and user
sudo -u postgres psql
CREATE DATABASE bakery_ops;
CREATE USER bakery_user WITH ENCRYPTED PASSWORD 'bakery_pass';
GRANT ALL PRIVILEGES ON DATABASE bakery_ops TO bakery_user;
\c bakery_ops
GRANT ALL ON SCHEMA public TO bakery_user;
\q

# Run database schema
PGPASSWORD=bakery_pass psql -U bakery_user -d bakery_ops -f database/schema.sql
# Apply hardening migration for idempotency, inventory ledger, KPI events, and alert rules
PGPASSWORD=bakery_pass psql -U bakery_user -d bakery_ops -f database/migrations/001_ops_hardening.sql
# Apply branch-access and KPI extension migration
PGPASSWORD=bakery_pass psql -U bakery_user -d bakery_ops -f database/migrations/002_branch_access_and_kpi.sql
```

3. **Install dependencies**
```bash
# Backend dependencies
npm install

# Frontend dependencies
cd client && npm install && cd ..
```

4. **Configure environment variables**
```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your configuration
# Update DATABASE_URL and JWT_SECRET
```

5. **Start the application**
```bash
# Development mode (runs both frontend and backend)
npm run dev

# Or run separately:
# Backend only
npm run server

# Frontend only (in another terminal)
npm run client
```

6. **Access the application**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Default Login Credentials
- **Username**: admin
- **Password**: admin123
- **Role**: Admin (full access)

## User Roles & Features

### Admin
- Full system access
- Dashboard with analytics and charts
- Product management (create, edit, delete)
- Inventory overview
- Sales history and reports
- Expense tracking and categorization
- Staff payment management
- Daily/weekly/monthly reports
- Notifications management

### Manager (Ground Manager)
- Inventory management
- Add baked or purchased items
- Create and send inventory batches
- Product catalog access
- View notifications
- Activity history

### Cashier
- Point of Sale interface
- Fast product search and selection
- Shopping cart management
- Complete sales transactions
- Print/view receipts
- Sales history

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Locations
- `GET /api/locations` - List active bakery locations/branches

### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (admin/manager)
- `PUT /api/products/:id` - Update product (admin/manager)
- `DELETE /api/products/:id` - Delete product (admin)

### Inventory
- `GET /api/inventory` - Get inventory for location
- `PUT /api/inventory/:productId` - Update inventory quantity
- `POST /api/inventory/batches` - Create inventory batch (atomic transaction)
- `GET /api/inventory/batches` - Get batch history
- `GET /api/inventory/batches/:id` - Get batch details

### Sales
- `POST /api/sales` - Create new sale (fails safely when stock is insufficient)
- `GET /api/sales` - Get sales history
- `GET /api/sales/:id` - Get sale details

### Expenses
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense (admin/manager)
- `PUT /api/expenses/:id` - Update expense (admin)
- `DELETE /api/expenses/:id` - Delete expense (admin)
- `GET /api/expenses/summary/categories` - Expense summary by category

### Staff Payments
- `GET /api/payments` - List staff payments (admin)
- `POST /api/payments` - Create payment (admin)
- `GET /api/payments/summary` - Payment summary (admin)

### Reports
- `GET /api/reports/daily` - Daily summary report
- `GET /api/reports/weekly` - Weekly summary report (includes categories + payment methods)
- `GET /api/reports/weekly/export` - Weekly CSV export
- `GET /api/reports/monthly` - Monthly summary report
- `GET /api/reports/products/profitability` - Product profitability analysis
- `GET /api/reports/branches/summary` - Multi-branch daily snapshot (admin)
- `GET /api/reports/kpis` - KPI summary aligned to success criteria (admin)

### Notifications
- `GET /api/notifications` - Get user notifications
- `GET /api/notifications/rules` - List alert rules (admin)
- `POST /api/notifications/rules` - Create alert rule (admin)
- `PUT /api/notifications/rules/:id` - Update alert rule (admin)
- `PUT /api/notifications/:id/read` - Mark notification as read
- `PUT /api/notifications/read-all` - Mark all as read
- `GET /api/notifications/unread/count` - Get unread count

### Activity Log
- `GET /api/activity` - Get activity log

## Database Schema

The application uses PostgreSQL with the following main tables:
- `users` - User accounts and authentication
- `locations` - Bakery locations/branches
- `categories` - Product categories
- `products` - Product catalog
- `inventory` - Current stock levels
- `inventory_batches` - Batch tracking
- `batch_items` - Items in each batch
- `sales` - Sales transactions
- `sale_items` - Items in each sale
- `expenses` - Business expenses
- `staff_payments` - Staff salary/payments
- `notifications` - User notifications
- `activity_log` - Audit trail
- `sync_queue` - Offline sync queue
- `idempotency_keys` - Deduplicate retried writes from offline queue
- `inventory_movements` - Inventory ledger for traceable stock movements
- `kpi_events` - KPI telemetry events (sales, batches, expenses)
- `alert_rules` - Threshold rules for low stock and sales anomalies
- `user_locations` - Explicit branch access map for users with multi-branch permissions

## Recent Reliability Improvements

- Refactored critical write flows (`/api/sales`, `/api/inventory/batches`) to use real PostgreSQL transactions with commit/rollback behavior.
- Added strict stock validation during checkout so sales cannot finalize when inventory is insufficient.
- Added `GET /api/locations` endpoint to support branch-aware UI flows.
- Updated weekly reporting endpoint to honor optional `start_date` for custom date ranges.
- Added Offline Queue v1 with periodic/online retry sync for sales, batches, and expenses.
- Added inventory movement ledger, idempotency keys, KPI events, and alert-rule management.
- Added multi-branch branch selector context in frontend and branch summary reporting endpoint.
- Added branch-access enforcement helper and tests for admin branch authorization.
- Upgraded offline queue to IndexedDB with retry/conflict history support.

## Technology Stack

### Frontend
- **React 18** - UI library
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Recharts** - Charts and visualizations
- **Lucide React** - Icons
- **Date-fns** - Date utilities

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **PostgreSQL** - Database
- **pg** - PostgreSQL client
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing
- **express-validator** - Input validation
- **CORS** - Cross-origin support
- **Morgan** - HTTP request logger

## Project Structure

```
bakery-ops-app/
├── client/                 # Frontend application
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # Reusable components
│   │   ├── context/       # React context providers
│   │   ├── pages/         # Page components
│   │   │   ├── admin/    # Admin pages
│   │   │   ├── manager/  # Manager pages
│   │   │   └── cashier/  # Cashier pages
│   │   ├── App.jsx       # Main app component
│   │   └── main.jsx      # Entry point
│   ├── public/           # Static assets
│   └── package.json      # Frontend dependencies
├── server/               # Backend application
│   ├── routes/          # API route handlers
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── inventory.js
│   │   ├── sales.js
│   │   ├── expenses.js
│   │   ├── payments.js
│   │   ├── reports.js
│   │   ├── notifications.js
│   │   └── activity.js
│   ├── middleware/      # Express middleware
│   │   └── auth.js
│   ├── db.js           # Database connection
│   └── index.js        # Server entry point
├── database/           # Database files
│   └── schema.sql     # Database schema
├── .env               # Environment variables
├── .gitignore        # Git ignore rules
├── package.json      # Backend dependencies
└── README.md         # This file
```

## Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
PORT=5000
DATABASE_URL=postgresql://bakery_user:bakery_pass@localhost:5432/bakery_ops
JWT_SECRET=your_super_secret_jwt_key_change_in_production
NODE_ENV=development
```

### Database Configuration
Update the `DATABASE_URL` in `.env` with your PostgreSQL credentials:
```
postgresql://username:password@host:port/database
```

## Development

### Running in Development Mode
```bash
# Run both frontend and backend
npm run dev

# Backend will run on http://localhost:5000
# Frontend will run on http://localhost:3000
```

### Code Structure Guidelines
- Keep components focused and reusable
- Use role-based access control for all protected routes
- Follow REST API conventions
- Maintain database transaction integrity
- Log all important activities

## Building for Production

### Build Frontend
```bash
cd client
npm run build
```

The built files will be in `client/dist/`

### Production Deployment
1. Set `NODE_ENV=production` in `.env`
2. Update `JWT_SECRET` with a strong secret key
3. Configure production database URL
4. Build the frontend
5. Serve frontend static files from Express
6. Use a process manager like PM2

## Testing

### Manual Testing Checklist
- [ ] User authentication (login/logout)
- [ ] Admin dashboard loads with correct data
- [ ] Manager can add inventory and send batches
- [ ] Cashier can create sales
- [ ] Products CRUD operations
- [ ] Reports generation (daily/weekly/monthly)
- [ ] Notifications system
- [ ] Role-based access control
- [ ] Mobile responsiveness

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check database credentials in `.env`
- Ensure database exists: `psql -U postgres -l`

### Port Already in Use
```bash
# Find and kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Or change PORT in .env
```

### Frontend Build Errors
```bash
# Clear cache and reinstall
cd client
rm -rf node_modules package-lock.json
npm install
```

## Future Enhancements

- Multi-branch dashboard with consolidated reporting
- Advanced role-based notifications
- Budget alerts and expense categorization
- Export to accounting software (CSV/Excel)
- Barcode/label printing for batches
- Mobile app version
- Advanced analytics with ML predictions
- Recipe management
- Supplier management
- Customer loyalty program

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support, please open an issue in the GitHub repository or contact the development team.

## Acknowledgments

- Built with modern web technologies
- Designed for real-world bakery operations
- Optimized for performance and usability

---

**Made with care for bakery owners and operators worldwide.**

import { createContext, useContext, useMemo, useState } from 'react';

const LanguageContext = createContext(null);

const translations = {
  en: {
    // ============================================
    // App & Branding
    // ============================================
    appTitle: 'Sina Sweet',
    appSubtitle: 'Bakery Operations System',
    
    // ============================================
    // Authentication
    // ============================================
    signIn: 'Sign In',
    signingIn: 'Signing in...',
    username: 'Username',
    password: 'Password',
    branch: 'Location',
    selectBranch: 'Select a location',
    loginError: 'Invalid username or password',
    sessionExpired: 'Your session has expired. Please sign in again.',
    
    // ============================================
    // Navigation - Main
    // ============================================
    dashboard: 'Dashboard',
    products: 'Products',
    productsManagement: 'Products Management',
    inventory: 'Inventory',
    sales: 'Sales',
    orders: 'Orders',
    preOrders: 'Pre-Orders',
    ordersQueue: 'Orders Queue',
    expenses: 'Expenses',
    staffPayments: 'Staff Payments',
    reports: 'Reports',
    notifications: 'Notifications',
    syncQueue: 'Sync Queue',
    staffManagement: 'Staff Management',
    historyLifecycle: 'History Lifecycle',
    accountManagement: 'Account Management',
    batches: 'Batches',
    settings: 'Settings',
    team: 'Team',
    
    // ============================================
    // Common Actions
    // ============================================
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    delete: 'Delete',
    deleting: 'Deleting...',
    edit: 'Edit',
    add: 'Add',
    create: 'Create',
    update: 'Update',
    updating: 'Updating...',
    remove: 'Remove',
    view: 'View',
    close: 'Close',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    submit: 'Submit',
    reset: 'Reset',
    clear: 'Clear',
    apply: 'Apply',
    search: 'Search',
    filter: 'Filter',
    refresh: 'Refresh',
    export: 'Export',
    import: 'Import',
    print: 'Print',
    download: 'Download',
    upload: 'Upload',
    select: 'Select',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    logout: 'Logout',
    
    // ============================================
    // Common Labels
    // ============================================
    name: 'Name',
    description: 'Description',
    notes: 'Notes',
    date: 'Date',
    time: 'Time',
    dateTime: 'Date & Time',
    category: 'Category',
    type: 'Type',
    status: 'Status',
    amount: 'Amount',
    quantity: 'Quantity',
    price: 'Price',
    total: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    unit: 'Unit',
    id: 'ID',
    code: 'Code',
    details: 'Details',
    email: 'Email',
    phone: 'Phone',
    address: 'Address',
    customer: 'Customer',
    customerName: 'Customer Name',
    customerPhone: 'Customer Phone',
    
    // ============================================
    // Date & Time
    // ============================================
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    lastMonth: 'Last Month',
    startDate: 'Start Date',
    endDate: 'End Date',
    specificDayExact: 'Specific Day (exact)',
    pickupDate: 'Pickup Date',
    pickupTime: 'Pickup Time',
    createdAt: 'Created At',
    updatedAt: 'Updated At',
    
    // ============================================
    // Status Values
    // ============================================
    pending: 'Pending',
    processing: 'Processing...',
    completed: 'Completed',
    cancelled: 'Cancelled',
    active: 'Active',
    inactive: 'Inactive',
    approved: 'Approved',
    rejected: 'Rejected',
    ready: 'Ready',
    delivered: 'Delivered',
    paid: 'Paid',
    unpaid: 'Unpaid',
    partial: 'Partial',
    synced: 'Synced',
    unsynced: 'Pending Sync',
    failed: 'Failed',
    voided: 'VOIDED',
    online: 'Online',
    offline: 'Offline',
    unknown: 'Unknown',
    
    // ============================================
    // Products
    // ============================================
    addProduct: 'Add Product',
    editProduct: 'Edit Product',
    deleteProduct: 'Delete Product',
    productName: 'Product Name',
    productPrice: 'Price',
    productCategory: 'Category',
    productImage: 'Product Image',
    productDetails: 'Product Details',
    productList: 'Product List',
    noProducts: 'No products found',
    searchProducts: 'Search products...',
    allCategories: 'All Categories',
    selectCategory: 'Select category',
    
    // ============================================
    // Sales & Cart
    // ============================================
    newSale: 'New Sale',
    cart: 'Cart',
    cartEmpty: 'Cart is empty',
    addToCart: 'Add to Cart',
    removeFromCart: 'Remove from Cart',
    clearCart: 'Clear Cart',
    completeSale: 'Complete Sale',
    queueSaleOffline: 'Queue Sale (Offline)',
    processingShort: 'Processing...',
    receipt: 'Receipt',
    receiptNumber: 'Receipt #',
    receiptOrAmount: 'Receipt # or Amount',
    paymentMethod: 'Payment Method',
    cash: 'Cash',
    card: 'Card',
    mobile: 'Mobile Money',
    credit: 'Credit',
    payment: 'Payment',
    change: 'Change',
    amountPaid: 'Amount Paid',
    amountDue: 'Amount Due',
    
    // ============================================
    // Sales History & Void
    // ============================================
    salesHistory: 'Sales History',
    noSalesFound: 'No sales found',
    voidSale: 'Void Sale',
    voidThisSale: 'Void This Sale?',
    voidSaleRestoreInventory: 'Void Sale & Restore Inventory',
    voidDetails: 'Void Details',
    reasonForVoiding: 'Reason for voiding *',
    reasonPlaceholder: 'e.g., Customer changed their mind, entered wrong amount...',
    noReasonProvided: 'No reason provided',
    provideVoidReason: 'Please provide a reason for voiding this sale',
    failedVoidSale: 'Failed to void sale',
    void: 'Void',
    transactionInfo: 'Transaction Info',
    voidRemainingSuffix: 'to void',
    voidedAt: 'Voided at:',
    remainingToVoidPrefix: 'You have',
    remainingToVoidMiddle: 'minutes remaining to void this sale.',
    inventoryRestoredMessage: 'Inventory will be restored automatically.',
    saleVoidedMessage: 'has been voided. Inventory restored.',
    
    // ============================================
    // Orders & Pre-Orders
    // ============================================
    newOrder: 'New Order',
    newPreOrder: 'New Pre-Order',
    orderDetails: 'Order Details',
    orderNumber: 'Order #',
    orderStatus: 'Order Status',
    orderItems: 'Order Items',
    orderNotes: 'Order Notes',
    noOrders: 'No orders found',
    markReady: 'Mark Ready',
    markCompleted: 'Mark Completed',
    cancelOrder: 'Cancel Order',
    printOrder: 'Print Order',
    deposit: 'Deposit',
    depositAmount: 'Deposit Amount',
    balanceDue: 'Balance Due',
    
    // ============================================
    // Inventory
    // ============================================
    currentStock: 'Current Stock',
    lowStock: 'Low Stock',
    outOfStock: 'Out of Stock',
    restock: 'Restock',
    stockLevel: 'Stock Level',
    minStock: 'Min Stock',
    stockAdjustment: 'Stock Adjustment',
    addStock: 'Add Stock',
    removeStock: 'Remove Stock',
    
    // ============================================
    // Expenses
    // ============================================
    addExpense: 'Add Expense',
    editExpense: 'Edit Expense',
    expenseCategory: 'Expense Category',
    expenseAmount: 'Amount',
    expenseDescription: 'Description',
    expenseDate: 'Date',
    noExpenses: 'No expenses found',
    totalExpenses: 'Total Expenses',
    
    // ============================================
    // Staff & Payments
    // ============================================
    addStaff: 'Add Staff',
    editStaff: 'Edit Staff',
    staffName: 'Staff Name',
    staffRole: 'Role',
    staffSalary: 'Salary',
    addPayment: 'Add Payment',
    paymentAmount: 'Payment Amount',
    paymentDate: 'Payment Date',
    noPayments: 'No payments found',
    
    // ============================================
    // Dashboard
    // ============================================
    todaySales: 'Today\'s Sales',
    totalSales: 'Total Sales',
    totalOrders: 'Total Orders',
    totalRevenue: 'Total Revenue',
    recentSales: 'Recent Sales',
    topProducts: 'Top Products',
    salesOverview: 'Sales Overview',
    quickActions: 'Quick Actions',
    
    // ============================================
    // Reports
    // ============================================
    generateReport: 'Generate Report',
    salesReport: 'Sales Report',
    expenseReport: 'Expense Report',
    inventoryReport: 'Inventory Report',
    profitLoss: 'Profit & Loss',
    dateRange: 'Date Range',
    
    // ============================================
    // Sync & Offline
    // ============================================
    sync: 'Sync',
    syncNow: 'Sync Now',
    syncing: 'Syncing...',
    syncComplete: 'Sync Complete',
    syncFailed: 'Sync Failed',
    pendingSync: 'Pending Sync',
    lastSynced: 'Last Synced',
    offlineMode: 'Offline Mode',
    connectionRestored: 'Connection Restored',
    
    // ============================================
    // Notifications
    // ============================================
    noNotifications: 'No notifications',
    markAsRead: 'Mark as Read',
    markAllRead: 'Mark All as Read',
    clearAll: 'Clear All',
    
    // ============================================
    // Settings & Preferences
    // ============================================
    language: 'Language',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    
    // ============================================
    // Table Headers
    // ============================================
    actions: 'Actions',
    items: 'Items',
    product: 'Product',
    qty: 'Qty',
    cashier: 'Cashier',
    reason: 'Reason:',
    dateAndTimeLabel: 'Date & Time:',
    amountLabel: 'Amount:',
    cashierLabel: 'Cashier:',
    paymentMethodLabel: 'Payment Method:',
    
    // ============================================
    // Confirmation Messages
    // ============================================
    confirmDelete: 'Are you sure you want to delete this?',
    confirmCancel: 'Are you sure you want to cancel?',
    confirmLogout: 'Are you sure you want to logout?',
    unsavedChanges: 'You have unsaved changes. Are you sure you want to leave?',
    
    // ============================================
    // Success Messages
    // ============================================
    savedSuccessfully: 'Saved successfully',
    deletedSuccessfully: 'Deleted successfully',
    updatedSuccessfully: 'Updated successfully',
    createdSuccessfully: 'Created successfully',
    saleCompleted: 'Sale completed successfully',
    orderCreated: 'Order created successfully',
    
    // ============================================
    // Error Messages
    // ============================================
    errorOccurred: 'An error occurred',
    loadingFailed: 'Failed to load data',
    saveFailed: 'Failed to save',
    deleteFailed: 'Failed to delete',
    networkError: 'Network error. Please check your connection.',
    sessionError: 'Session error. Please sign in again.',
    processFailedLoadSalesHistory: 'Failed to load sales history',
    
    // ============================================
    // Validation Messages
    // ============================================
    requiredField: 'This field is required',
    invalidFormat: 'Invalid format',
    invalidEmail: 'Invalid email address',
    invalidPhone: 'Invalid phone number',
    invalidNumber: 'Must be a valid number',
    minValue: 'Value must be at least',
    maxValue: 'Value must not exceed',
    
    // ============================================
    // Empty States
    // ============================================
    noData: 'No data available',
    noResults: 'No results found',
    noItemsInCart: 'No items in cart',
    startAddingProducts: 'Start adding products to your cart',
    
    // ============================================
    // Loading States
    // ============================================
    loading: 'Loading...',
    loadingData: 'Loading data...',
    pleaseWait: 'Please wait...',
  },
  
  am: {
    // ============================================
    // App & Branding
    // ============================================
    appTitle: 'ሲና ስዊት',
    appSubtitle: 'የዳቦ ቤት አስተዳደር ስርዓት',
    
    // ============================================
    // Authentication
    // ============================================
    signIn: 'ግባ',
    signingIn: 'በመግባት ላይ...',
    username: 'የተጠቃሚ ስም',
    password: 'የይለፍ ቃል',
    branch: 'ቦታ',
    selectBranch: 'ቦታ ይምረጡ',
    loginError: 'የተሳሳተ የተጠቃሚ ስም ወይም የይለፍ ቃል',
    sessionExpired: 'ክፍለ ጊዜዎ አልቋል። እባክዎ እንደገና ይግቡ።',
    
    // ============================================
    // Navigation - Main
    // ============================================
    dashboard: 'ዳሽቦርድ',
    products: 'ምርቶች',
    productsManagement: 'የምርት አስተዳደር',
    inventory: 'ኢንቨንተሪ',
    sales: 'ሽያጭ',
    orders: 'ትዕዛዞች',
    preOrders: 'ቅድመ ትዕዛዞች',
    ordersQueue: 'የትዕዛዝ ወረፋ',
    expenses: 'ወጪዎች',
    staffPayments: 'የሰራተኛ ክፍያ',
    reports: 'ሪፖርቶች',
    notifications: 'ማሳወቂያዎች',
    syncQueue: 'ሲንክ ዝርዝር',
    staffManagement: 'የሰራተኛ አስተዳደር',
    historyLifecycle: 'ታሪክ ላይፍሳይክል',
    accountManagement: 'የአካውንት አስተዳደር',
    batches: 'ባች',
    settings: 'ቅንብሮች',
    team: 'ቡድን',
    
    // ============================================
    // Common Actions
    // ============================================
    save: 'አስቀምጥ',
    saving: 'በማስቀመጥ ላይ...',
    cancel: 'ይቅር',
    delete: 'ሰርዝ',
    deleting: 'በመሰረዝ ላይ...',
    edit: 'አርትዕ',
    add: 'ጨምር',
    create: 'ፍጠር',
    update: 'አዘምን',
    updating: 'በማዘመን ላይ...',
    remove: 'አስወግድ',
    view: 'ይመልከቱ',
    close: 'ዝጋ',
    confirm: 'አረጋግጥ',
    back: 'ተመለስ',
    next: 'ቀጣይ',
    submit: 'አስገባ',
    reset: 'ዳግም አስጀምር',
    clear: 'አጽዳ',
    apply: 'ተግብር',
    search: 'ፈልግ',
    filter: 'አጣራ',
    refresh: 'አድስ',
    export: 'ላክ',
    import: 'አስገባ',
    print: 'አትም',
    download: 'አውርድ',
    upload: 'ጫን',
    select: 'ምረጥ',
    selectAll: 'ሁሉንም ምረጥ',
    deselectAll: 'ሁሉንም አትምረጥ',
    logout: 'ውጣ',
    
    // ============================================
    // Common Labels
    // ============================================
    name: 'ስም',
    description: 'መግለጫ',
    notes: 'ማስታወሻዎች',
    date: 'ቀን',
    time: 'ሰዓት',
    dateTime: 'ቀን እና ሰዓት',
    category: 'ምድብ',
    type: 'ዓይነት',
    status: 'ሁኔታ',
    amount: 'መጠን',
    quantity: 'ብዛት',
    price: 'ዋጋ',
    total: 'ጠቅላላ',
    subtotal: 'ንዑስ ድምር',
    discount: 'ቅናሽ',
    tax: 'ግብር',
    unit: 'አሃድ',
    id: 'መለያ',
    code: 'ኮድ',
    details: 'ዝርዝሮች',
    email: 'ኢሜይል',
    phone: 'ስልክ',
    address: 'አድራሻ',
    customer: 'ደንበኛ',
    customerName: 'የደንበኛ ስም',
    customerPhone: 'የደንበኛ ስልክ',
    
    // ============================================
    // Date & Time
    // ============================================
    today: 'ዛሬ',
    yesterday: 'ትናንት',
    thisWeek: 'በዚህ ሳምንት',
    thisMonth: 'በዚህ ወር',
    lastMonth: 'ባለፈው ወር',
    startDate: 'የመጀመሪያ ቀን',
    endDate: 'የመጨረሻ ቀን',
    specificDayExact: 'የተወሰነ ቀን (ትክክለኛ)',
    pickupDate: 'የማንሳት ቀን',
    pickupTime: 'የማንሳት ሰዓት',
    createdAt: 'የተፈጠረበት',
    updatedAt: 'የተሻሻለበት',
    
    // ============================================
    // Status Values
    // ============================================
    pending: 'በመጠባበቅ ላይ',
    processing: 'በሂደት ላይ...',
    completed: 'ተጠናቋል',
    cancelled: 'ተሰርዟል',
    active: 'ንቁ',
    inactive: 'ንቁ አይደለም',
    approved: 'ጸድቋል',
    rejected: 'ተቀባይነት አላገኘም',
    ready: 'ዝግጁ',
    delivered: 'ተረክቧል',
    paid: 'ተከፍሏል',
    unpaid: 'አልተከፈለም',
    partial: 'በከፊል',
    synced: 'ተስተካክሏል',
    unsynced: 'ማስተካከል ያልተደረገ',
    failed: 'አልተሳካም',
    voided: 'ተሰርዟል',
    online: 'በመስመር ላይ',
    offline: 'ከመስመር ውጭ',
    unknown: 'ያልታወቀ',
    
    // ============================================
    // Products
    // ============================================
    addProduct: 'ምርት ጨምር',
    editProduct: 'ምርት አርትዕ',
    deleteProduct: 'ምርት ሰርዝ',
    productName: 'የምርት ስም',
    productPrice: 'ዋጋ',
    productCategory: 'ምድብ',
    productImage: 'የምርት ምስል',
    productDetails: 'የምርት ዝርዝሮች',
    productList: 'የምርት ዝርዝር',
    noProducts: 'ምንም ምርት አልተገኘም',
    searchProducts: 'ምርቶችን ፈልግ...',
    allCategories: 'ሁሉም ምድቦች',
    selectCategory: 'ምድብ ይምረጡ',
    
    // ============================================
    // Sales & Cart
    // ============================================
    newSale: 'አዲስ ሽያጭ',
    cart: 'ጋሪ',
    cartEmpty: 'ጋሪው ባዶ ነው',
    addToCart: 'ወደ ጋሪ ጨምር',
    removeFromCart: 'ከጋሪ አውጣ',
    clearCart: 'ጋሪውን አጽዳ',
    completeSale: 'ሽያጭ አጠናቅቅ',
    queueSaleOffline: 'ከመስመር ውጭ ሽያጭ አስቀምጥ',
    processingShort: 'በሂደት ላይ...',
    receipt: 'ደረሰኝ',
    receiptNumber: 'ደረሰኝ ቁጥር',
    receiptOrAmount: 'ደረሰኝ ቁጥር ወይም መጠን',
    paymentMethod: 'የክፍያ ዘዴ',
    cash: 'በጥሬ ገንዘብ',
    card: 'በካርድ',
    mobile: 'በሞባይል ገንዘብ',
    credit: 'በብድር',
    payment: 'ክፍያ',
    change: 'መልስ',
    amountPaid: 'የተከፈለ መጠን',
    amountDue: 'ሊከፈል የሚገባ',
    
    // ============================================
    // Sales History & Void
    // ============================================
    salesHistory: 'የሽያጭ ታሪክ',
    noSalesFound: 'ምንም ሽያጭ አልተገኘም',
    voidSale: 'ሽያጭ ሰርዝ',
    voidThisSale: 'ይህን ሽያጭ ሰርዝ?',
    voidSaleRestoreInventory: 'ሽያጭ ሰርዝ እና ኢንቨንተሪ መልስ',
    voidDetails: 'የመሰረዝ ዝርዝር',
    reasonForVoiding: 'የመሰረዝ ምክንያት *',
    reasonPlaceholder: 'ምሳሌ፦ ደንበኛው ሀሳቡን ቀይሯል፣ የተሳሳተ መጠን ገብቷል...',
    noReasonProvided: 'ምክንያት አልተሰጠም',
    provideVoidReason: 'እባክዎ ይህን ሽያጭ ለመሰረዝ ምክንያት ያስገቡ',
    failedVoidSale: 'ሽያጩን መሰረዝ አልተቻለም',
    void: 'ሰርዝ',
    transactionInfo: 'የግብይት መረጃ',
    voidRemainingSuffix: 'ለመሰረዝ',
    voidedAt: 'የተሰረዘበት ጊዜ:',
    remainingToVoidPrefix: 'እርስዎ አሁንም',
    remainingToVoidMiddle: 'ደቂቃ ቀርቶዎታል ይህን ሽያጭ ለመሰረዝ።',
    inventoryRestoredMessage: 'ኢንቨንተሪ በራስ-ሰር ይመለሳል።',
    saleVoidedMessage: 'ተሰርዟል። ኢንቨንተሪ ተመልሷል።',
    
    // ============================================
    // Orders & Pre-Orders
    // ============================================
    newOrder: 'አዲስ ትዕዛዝ',
    newPreOrder: 'አዲስ ቅድመ ትዕዛዝ',
    orderDetails: 'የትዕዛዝ ዝርዝሮች',
    orderNumber: 'ትዕዛዝ ቁጥር',
    orderStatus: 'የትዕዛዝ ሁኔታ',
    orderItems: 'የትዕዛዝ እቃዎች',
    orderNotes: 'የትዕዛዝ ማስታወሻዎች',
    noOrders: 'ምንም ትዕዛዝ አልተገኘም',
    markReady: 'ዝግጁ ምልክት አድርግ',
    markCompleted: 'ተጠናቋል ምልክት አድርግ',
    cancelOrder: 'ትዕዛዝ ሰርዝ',
    printOrder: 'ትዕዛዝ አትም',
    deposit: 'ቅድመ ክፍያ',
    depositAmount: 'የቅድመ ክፍያ መጠን',
    balanceDue: 'ቀሪ ክፍያ',
    
    // ============================================
    // Inventory
    // ============================================
    currentStock: 'የአሁኑ ክምችት',
    lowStock: 'ዝቅተኛ ክምችት',
    outOfStock: 'ክምችት አልቋል',
    restock: 'ክምችት ሙላ',
    stockLevel: 'የክምችት ደረጃ',
    minStock: 'ዝቅተኛ ክምችት',
    stockAdjustment: 'የክምችት ማስተካከያ',
    addStock: 'ክምችት ጨምር',
    removeStock: 'ክምችት ቀንስ',
    
    // ============================================
    // Expenses
    // ============================================
    addExpense: 'ወጪ ጨምር',
    editExpense: 'ወጪ አርትዕ',
    expenseCategory: 'የወጪ ምድብ',
    expenseAmount: 'መጠን',
    expenseDescription: 'መግለጫ',
    expenseDate: 'ቀን',
    noExpenses: 'ምንም ወጪ አልተገኘም',
    totalExpenses: 'ጠቅላላ ወጪዎች',
    
    // ============================================
    // Staff & Payments
    // ============================================
    addStaff: 'ሰራተኛ ጨምር',
    editStaff: 'ሰራተኛ አርትዕ',
    staffName: 'የሰራተኛ ስም',
    staffRole: 'ሚና',
    staffSalary: 'ደመወዝ',
    addPayment: 'ክፍያ ጨምር',
    paymentAmount: 'የክፍያ መጠን',
    paymentDate: 'የክፍያ ቀን',
    noPayments: 'ምንም ክፍያ አልተገኘም',
    
    // ============================================
    // Dashboard
    // ============================================
    todaySales: 'የዛሬ ሽያጭ',
    totalSales: 'ጠቅላላ ሽያጭ',
    totalOrders: 'ጠቅላላ ትዕዛዞች',
    totalRevenue: 'ጠቅላላ ገቢ',
    recentSales: 'የቅርብ ጊዜ ሽያጮች',
    topProducts: 'ምርጥ ምርቶች',
    salesOverview: 'የሽያጭ አጠቃላይ እይታ',
    quickActions: 'ፈጣን እርምጃዎች',
    
    // ============================================
    // Reports
    // ============================================
    generateReport: 'ሪፖርት አመንጭ',
    salesReport: 'የሽያጭ ሪፖርት',
    expenseReport: 'የወጪ ሪፖርት',
    inventoryReport: 'የኢንቨንተሪ ሪፖርት',
    profitLoss: 'ትርፍ እና ኪሳራ',
    dateRange: 'የቀን ክልል',
    
    // ============================================
    // Sync & Offline
    // ============================================
    sync: 'ሲንክ',
    syncNow: 'አሁን ሲንክ',
    syncing: 'በማስተካከል ላይ...',
    syncComplete: 'ማስተካከል ተጠናቋል',
    syncFailed: 'ማስተካከል አልተሳካም',
    pendingSync: 'ማስተካከል ያልተደረገ',
    lastSynced: 'ለመጨረሻ ጊዜ የተስተካከለ',
    offlineMode: 'ከመስመር ውጭ ሁነታ',
    connectionRestored: 'ግንኙነት ተመልሷል',
    
    // ============================================
    // Notifications
    // ============================================
    noNotifications: 'ምንም ማሳወቂያ የለም',
    markAsRead: 'እንደተነበበ ምልክት አድርግ',
    markAllRead: 'ሁሉንም እንደተነበበ ምልክት አድርግ',
    clearAll: 'ሁሉንም አጽዳ',
    
    // ============================================
    // Settings & Preferences
    // ============================================
    language: 'ቋንቋ',
    theme: 'ገጽታ',
    light: 'ብርሃን',
    dark: 'ጨለማ',
    
    // ============================================
    // Table Headers
    // ============================================
    actions: 'እርምጃዎች',
    items: 'እቃዎች',
    product: 'ምርት',
    qty: 'ብዛት',
    cashier: 'ካሸር',
    reason: 'ምክንያት:',
    dateAndTimeLabel: 'ቀን እና ሰዓት:',
    amountLabel: 'መጠን:',
    cashierLabel: 'ካሸር:',
    paymentMethodLabel: 'የክፍያ ዘዴ:',
    
    // ============================================
    // Confirmation Messages
    // ============================================
    confirmDelete: 'ይህን ለመሰረዝ እርግጠኛ ነዎት?',
    confirmCancel: 'ለመተው እርግጠኛ ነዎት?',
    confirmLogout: 'ለመውጣት እርግጠኛ ነዎት?',
    unsavedChanges: 'ያልተቀመጡ ለውጦች አሉዎት። ለመልቀቅ እርግጠኛ ነዎት?',
    
    // ============================================
    // Success Messages
    // ============================================
    savedSuccessfully: 'በተሳካ ሁኔታ ተቀምጧል',
    deletedSuccessfully: 'በተሳካ ሁኔታ ተሰርዟል',
    updatedSuccessfully: 'በተሳካ ሁኔታ ተሻሽሏል',
    createdSuccessfully: 'በተሳካ ሁኔታ ተፈጥሯል',
    saleCompleted: 'ሽያጭ በተሳካ ሁኔታ ተጠናቋል',
    orderCreated: 'ትዕዛዝ በተሳካ ሁኔታ ተፈጥሯል',
    
    // ============================================
    // Error Messages
    // ============================================
    errorOccurred: 'ስህተት ተፈጥሯል',
    loadingFailed: 'ውሂብ መጫን አልተቻለም',
    saveFailed: 'ማስቀመጥ አልተቻለም',
    deleteFailed: 'መሰረዝ አልተቻለም',
    networkError: 'የኔትወርክ ስህተት። እባክዎ ግንኙነትዎን ይፈትሹ።',
    sessionError: 'የክፍለ ጊዜ ስህተት። እባክዎ እንደገና ይግቡ።',
    processFailedLoadSalesHistory: 'የሽያጭ ታሪክ መጫን አልተቻለም',
    
    // ============================================
    // Validation Messages
    // ============================================
    requiredField: 'ይህ መስክ አስፈላጊ ነው',
    invalidFormat: 'ልክ ያልሆነ ቅርጸት',
    invalidEmail: 'ልክ ያልሆነ ኢሜይል አድራሻ',
    invalidPhone: 'ልክ ያልሆነ ስልክ ቁጥር',
    invalidNumber: 'ትክክለኛ ቁጥር መሆን አለበት',
    minValue: 'ዋጋው ቢያንስ መሆን አለበት',
    maxValue: 'ዋጋው ከዚህ መብለጥ የለበትም',
    
    // ============================================
    // Empty States
    // ============================================
    noData: 'ምንም ውሂብ የለም',
    noResults: 'ምንም ውጤት አልተገኘም',
    noItemsInCart: 'በጋሪ ውስጥ ምንም እቃ የለም',
    startAddingProducts: 'ምርቶችን ወደ ጋሪዎ መጨመር ይጀምሩ',
    
    // ============================================
    // Loading States
    // ============================================
    loading: 'በመጫን ላይ...',
    loadingData: 'ውሂብ በመጫን ላይ...',
    pleaseWait: 'እባክዎ ይጠብቁ...',
  },
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(localStorage.getItem('lang') || 'en');

  const setLang = (lang) => {
    setLanguage(lang);
    localStorage.setItem('lang', lang);
  };

  const t = (key) => translations[language]?.[key] || translations.en[key] || key;

  const value = useMemo(() => ({ language, setLang, t }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

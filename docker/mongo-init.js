// =============================================================================
// MongoDB Initialization Script
// =============================================================================
// This script runs automatically when MongoDB container starts for the first time.
// It creates the application database and a dedicated user with minimal permissions.
// 
// Location: /docker-entrypoint-initdb.d/mongo-init.js
// =============================================================================

// Get environment variables (set in docker-compose)
const appDatabase = process.env.MONGO_DATABASE || 'ecommerce';
const appUsername = process.env.MONGO_APP_USERNAME || 'app_user';
const appPassword = process.env.MONGO_APP_PASSWORD || 'app_password';

print('=============================================================================');
print('MongoDB Initialization Script');
print('=============================================================================');
print(`Creating database: ${appDatabase}`);
print(`Creating user: ${appUsername}`);
print('=============================================================================');

// Switch to the application database
db = db.getSiblingDB(appDatabase);

// Create the application user with read/write access to the app database only
// This follows the principle of least privilege
db.createUser({
    user: appUsername,
    pwd: appPassword,
    roles: [
        {
            role: 'readWrite',
            db: appDatabase
        }
    ]
});

print(`User '${appUsername}' created with readWrite access to '${appDatabase}'`);

// Create initial collections (optional but helps with indexing)
db.createCollection('products');

// Create indexes for better query performance
db.products.createIndex({ name: 1 });
db.products.createIndex({ createdAt: -1 });

print('Collections and indexes created successfully');
print('=============================================================================');
print('MongoDB initialization complete!');
print('=============================================================================');

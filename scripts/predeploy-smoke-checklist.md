# Pre-deploy Smoke Checklist

## Critical path API checks

1. Login and capture token
2. Create sale online
3. Create sale offline (queue), then sync replay
4. Create staff payment
5. Read notifications list

## Offline replay attribution checks

1. Login as cashier and go offline
2. Create sale and confirm it is queued
3. Logout cashier without syncing
4. Login as admin and trigger sync
5. Verify sale cashier remains original cashier (not admin)

## Batch notification guard checks

1. Queue an inventory batch while offline
2. Sync queue online
3. Verify batch record is created
4. Verify no new `batch` notification is emitted for that offline replay

## UI checks

1. Logout modal pending count matches unresolved queue size
2. History table cashier name remains original actor after replay
3. Sale details and print actions still render

# DairyFlow action inventory

This is the implementation checklist. An action is complete only when its handler, transaction effects, error path and automated test exist.

| Page | Action | Roles | Handler/service | Collections | Success / error | Test | Status |
|---|---|---|---|---|---|---|---|
| Login | Sign in/out | all | `login`, `logout` | users, sessions, login_attempts, audit_logs | session or clear configuration/credential error | auth E2E | Partial |
| Dashboard | Quick actions/date/search | by action | linked workflow handlers | source ledgers | opens selected workflow/date/result | navigation E2E | Pending |
| Vendors | Add/edit/activate/rate/payment/statement/WhatsApp | owner, manager, accountant | vendor/payment services | vendors, rates, party ledger, cashbook, audit | immediate list/receipt or field error | vendor E2E | Partial |
| Milk Received | Review/post/reverse/print/WhatsApp | owner, manager | procurement service | purchases, party ledger, inventory, financial, audit | receipt or line-specific error | procurement integration/E2E | Partial |
| Customers | Add/edit/activate/payment/statement/WhatsApp | owner, manager, accountant, cashier | customer/payment services | customers, rates, party ledger, cashbook, audit | immediate list/receipt or field error | customer E2E | Pending |
| Routes | Add/edit/deactivate/post daily route | owner, manager, delivery | route/delivery services | routes, deliveries, inventory, party ledger, cashbook, financial, notifications, audit | batch receipt or exception error | delivery E2E | Pending |
| Shop Sales | Cash/digital/credit sale/reverse | owner, manager, cashier | sales service | sales, inventory, party ledger/cashbook, financial, audit | receipt or stock/input error | sales E2E | Pending |
| Inventory | Product/open/count/waste/return/adjust/transfer | owner, manager | inventory service | products, inventory movements, notifications, audit | updated stock or validation error | inventory E2E | Pending |
| Production | Review/post/reverse | owner, manager | production service | batches, inventory, financial, audit | batch result or stock/input error | production E2E | Pending |
| Expenses | Draft/edit/post/reverse/attachment/export | owner, manager, accountant | expense service/upload route | expenses, cashbook, financial, audit | receipt or validation/upload error | expense E2E | Pending |
| Cashbook | Close/reopen/history | owner, manager, accountant, cashier | closing service | cashbook, daily closings, audit | locked closing or variance error | closing E2E | Pending |
| Notifications | acknowledge/snooze/resolve/open | all permitted | notification actions | notifications, audit | status update or authorization error | notification integration | Pending |
| Settings | Save/rates/configuration | owner | settings service | business settings, rate history, audit | updated settings or field error | settings E2E | Pending |
| Reports | Filter/export/download/print | owner, manager, accountant | report/export routes | authoritative ledgers | reconciled file or query error | export integration | Pending |

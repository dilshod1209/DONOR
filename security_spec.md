# Security Specification for Donor-Help

## 1. Data Invariants
- A donor profile can only be created/updated by the owner.
- A hospital profile can only be created/updated by the owner.
- Emergency requests can only be created by hospitals.
- Donations can only be recorded by hospitals (as they verify the donation).
- Users cannot change their own `bonusPoints` or `rating` directly.
- Users cannot change their own `role` after creation.

## 2. The "Dirty Dozen" Payloads (Denial Expected)
1. **Identity Spoofing**: User A trying to update User B's profile.
2. **Role Escalation**: Donor trying to set `role: 'hospital'`.
3. **Ghost Field**: Adding `isAdmin: true` to a donor profile.
4. **Rating Manipulation**: Donor trying to increment their own `rating`.
5. **Unauthorized Request**: Donor trying to create an `emergency_request`.
6. **Orphaned Donation**: Creating a donation for a non-existent donor.
7. **Junk ID Poisoning**: Creating a request with a 2KB string as ID.
8. **PII Leak**: Authenticated user trying to list all users' phone numbers without being a hospital.
9. **State Shortcut**: Hospital trying to set `status: 'fulfilled'` on a request without providing fulfillment data.
10. **Immutable Field Change**: User trying to change `createdAt` on an existing record.
11. **Negative Units**: Creating an emergency request with `unitsNeeded: -5`.
12. **Unverified Email**: User with unverified email trying to write data.

## 3. Test Runner (Placeholder)
`npm install --save-dev @firebase/rules-unit-testing`
// Tests will verify that all above payloads return PERMISSION_DENIED.

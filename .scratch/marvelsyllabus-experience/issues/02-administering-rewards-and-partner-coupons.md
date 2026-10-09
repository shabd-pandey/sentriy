# 02: Managing rewards and partner coupons in the admin workspace

**What to build:** The owner can manage game reward campaigns, select the single reward each campaign grants, enter dwrpar.com coupon-code inventory, and configure the shared profile-card QR destination from an admin workspace styled using the supplied profile-page reference.

**Blocked by:** movie-ticketing-platform #01: Creating the runnable platform foundation and role-safe sign-in.

**Status:** ready-for-agent

- [ ] The owner/admin can create reward campaigns, select exactly one reward offer per campaign, activate/deactivate new enrollment, and prevent ordinary customers from accessing these actions.
- [ ] Only one campaign accepts new enrollments at a time; admins can choose whether a new campaign may overlap prior enrolled players finishing their completion window, with overlap enabled by default.
- [ ] Campaign configuration includes the three-play requirement and a completion window defaulting to seven days from first play, configurable per campaign.
- [ ] Food-coupon rewards use a pool of manually entered unique dwrpar.com codes with operator-written instructions and optional per-code expiry; an unused valid code is reserved when a customer enrolls, and the campaign stops new enrollment when no reservable codes remain.
- [ ] A reserved partner code remains valid for the entrant's completion window; adding more codes resumes an exhausted coupon campaign automatically unless an admin has manually paused/deactivated it.
- [ ] Ticket-benefit campaigns support complimentary tickets for admin-designated eligible screenings and a fixed reward cap, or a one-ticket 30%/50% discount with a fixed reward cap.
- [ ] A native ticket-reward cap cannot be raised after campaign creation; the operator must create another campaign to increase the planned reward inventory.
- [ ] The owner can configure reward expiry as a duration from grant; the effective food-coupon reward expiry is no later than its assigned code's optional expiry.
- [ ] New enrollment stops when reward slots are exhausted, but existing reserved entrants can finish during their completion window. Manually pausing/deactivating also blocks new enrollment without invalidating existing reservations.
- [ ] The admin can review campaign entrants, reservations, issued rewards, and redemptions.
- [ ] The full admin workspace applies the supplied User Profile Page visual direction while keeping operational controls clear and accessible.
- [ ] The owner can set or update one valid shared QR destination URL for all profile cards; a missing destination is represented as unset.
- [ ] Reward offers, code inventory, and QR configuration persist in the shared backend and are protected by server-side owner/admin authorization.
- [ ] End-to-end acceptance verifies campaign configuration, code reservation and replenishment, expiry, fixed caps, overlap/pause behavior, authorization denial for customers, and shared QR configuration.

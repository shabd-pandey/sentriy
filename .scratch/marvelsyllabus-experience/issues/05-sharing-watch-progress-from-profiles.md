# 05: Sharing watched progress from customer profiles

**What to build:** A signed-in customer can review watch progress and streaks, configure profile and privacy settings, and share a designed profile card containing only the information they chose to reveal.

**Blocked by:** 02: Managing rewards and partner coupons in the admin workspace; movie-ticketing-platform #02: Managing catalog titles and showing the customer catalog.

**Status:** ready-for-agent

- [ ] The profile follows the supplied User Profile Page visual direction and presents watched films/episodes and the customer's viewing streak.
- [ ] Customers can access their ticket wallet/bookings, earned rewards, watched progress, profile details, privacy/share-card controls, notification preferences, identity-provider sign-in/security settings, sign-out, and delete-account actions from profile navigation.
- [ ] Watched titles and streak data are included in a shared card only when explicitly enabled by the customer; bookings, profile details, and account identity are never included.
- [ ] A share action downloads or shares a rendered card image with only the selected watch-progress fields; no public profile page or public watch-history endpoint is created.
- [ ] The card displays a QR code for the admin-configured shared destination, when set; every customer's QR encodes the same destination and contains no account identifier, watch data, or credentials.
- [ ] A viewing streak counts consecutive Asia/Kolkata calendar days with at least one film or episode marked watched; multiple watch marks on one day count as one day.
- [ ] Customers can unmark a watched title/episode; its watched status is removed and streaks are recalculated from the remaining watch marks.
- [ ] Profile and sharing settings persist for the signed-in account, and watched-state data remains isolated between accounts.
- [ ] End-to-end acceptance verifies opt-in sharing, QR destination consistency/privacy, streak boundaries, account isolation, and responsive/accessibility behavior.

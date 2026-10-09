# MarvelSyllabus Customer Experience, Rewards, and Profile

Status: ready-for-agent

## Problem Statement

The movie-ticketing platform needs a consistent, recognizable customer experience under the name MarvelSyllabus. Customers need the supplied cinematic movie interface, a “Play & Earn Rewards” entry point that leads to the existing game experience, and a profile that makes watched titles and viewing streaks useful and shareable. The operator needs to manage reward offers and manually supplied partner coupon codes without weakening the existing account, booking, or payment rules.

## Solution

Apply the supplied Movie Booking Interface reference to the main customer-facing movie experience, the Music Festival Landing Page reference to the game experience, and the User Profile Page reference to the profile card and profile-management surfaces. Integrate these designs with the existing shared catalog and ticketing platform under the MarvelSyllabus brand.

Unlock the reward game only for signed-in customers with a qualifying confirmed paid booking. The admin runs one enrollment campaign at a time and selects one reward for all entrants. Each eligible customer gets up to three completed game plays and one reserved campaign reward. After the third play, grant that reward; after the customer claims it, hide that campaign's game entry point for that customer. Campaigns can award manually entered dwrpar.com food coupon codes, a complimentary ticket for an admin-designated eligible screening, or a one-ticket 30%/50% discount. Apply platform-issued ticket benefits automatically during checkout. Make a profile card shareable as a rendered image containing only opted-in watched-title and viewing-streak information, never bookings, profile details, or account identity. The operator configures one QR destination shared by all profile cards.

## User Stories

1. As a customer, I want the site to be branded MarvelSyllabus with the tagline “Burden with Glorious Syllabus,” so that the ticketing experience has a consistent identity.
2. As a customer, I want the main movie experience to follow the supplied Movie Booking Interface reference, so that browsing and booking feel cinematic and visually coherent.
3. As a customer, I want to browse the combined, admin-ordered catalog of 57 films and 4 series, so that I can follow the intended watch order.
4. As a customer, I want each catalog item to be visibly identified as a film or series, so that I understand what kind of screening I am choosing.
5. As a customer, I want inactive titles to remain visible as Upcoming but not bookable, so that I can see what is planned without attempting an unavailable purchase.
6. As a customer, I want to see active titles and their chronologically ordered screenings, so that I can choose a bookable date and time.
7. As a customer with a qualifying paid booking and an available campaign, I want a “Play & Earn Rewards” entry point, so that I can access the game I am eligible to play.
8. As a customer, I want the game to use the supplied Music Festival Landing Page design and existing game behavior, so that the game remains recognizable and playable.
9. As a customer with a confirmed paid booking, I want the Play & Earn entry point to unlock for an active campaign, so that game rewards are tied to a real purchase.
10. As a customer, I want one campaign entry per eligible account and campaign regardless of tickets per order or repeat orders, so that the play allowance is clear and cannot be multiplied by splitting purchases.
11. As a signed-in customer, I want up to three completed plays in each campaign I am eligible for, so that campaign progress persists across sessions and devices.
12. As a customer, I want a completed play to count when the 30-second game round reaches its results state, so that the result is recorded even if I do not press the separate claim acknowledgement.
13. As a customer, I want one reward from the campaign's admin-selected offer reserved when I start my first round, so that the campaign cannot promise more rewards than it can fulfill.
14. As a customer, I want my reservation and progress to last for the campaign's configured completion window, defaulting to seven days from my first round, so that I can finish the remaining rounds later.
15. As a customer, I want an unfinished active round reservation to expire after two minutes without completion, so that a disconnected play can be retried without holding a round indefinitely.
16. As a customer, I want exactly one reward granted after my third completed play, so that I can use the benefit I earned.
17. As a customer, I want the campaign's Play & Earn entry point hidden after I claim its reward, so that I can tell that campaign's reward has been claimed; it may become available again for a separately eligible future campaign.
18. As a customer, I want to see my earned reward, expiry, redemption instructions, and whether it is unused or redeemed, so that I know what I can still claim.
19. As a customer, I want an earned dwrpar.com food coupon code displayed with its instructions, so that I can redeem the partner offer on that service.
20. As a customer, I want an earned complimentary premiere ticket or 30%/50% discount applied automatically to one eligible ticket at checkout, so that I do not need to enter a platform promo code.
21. As a customer, I want an applied ticket reward to be used only once and reflected in the checkout total before I pay, so that the order amount is clear and a reward cannot be reused.
22. As an owner/admin, I want to create a campaign and choose one reward offer that every entrant can earn, so that reward selection is predictable.
23. As an owner/admin, I want to manage campaign enrollment, completion-window, reward-cap, eligible-screening, and overlap settings, so that I can control when customers may enter and what the campaign can fulfill.
24. As an owner/admin, I want to enter a pool of unique dwrpar.com codes with optional per-code expiry and instructions, so that each food-coupon winner receives one available code.
25. As an owner/admin, I want native ticket rewards to have a fixed campaign cap and ticket eligibility rules, so that the platform does not issue more benefits than planned.
26. As an owner/admin, I want to see campaign entrants, reservations, rewards issued, and redemptions, so that I can track reward fulfillment.
27. As a customer, I want to mark a film watched and mark individual series episodes watched or unwatch them, so that my watch progress remains correct if I fix a mistake.
28. As a customer, I want my profile to show relevant watched-title information and my viewing streak, so that I can review my progress.
29. As a customer, I want to download or share a rendered profile-card image based on the supplied User Profile Page reference, so that I can share selected watched and streak information without publishing a profile page.
30. As a customer, I want to opt in to watched titles and streaks independently for the shared card, so that no activity is exposed without my choice.
31. As a customer, I want the card to exclude my bookings, profile details, and account identity, so that shared watch activity does not disclose other personal information.
32. As a customer, I want the profile card to include a QR code when the operator has configured a destination, so that people viewing the image can reach the operator's chosen page.
33. As an owner/admin, I want to configure one QR destination URL for profile cards, so that all profile cards encode the same operator-controlled destination.
34. As a customer, I want profile navigation to expose my ticket wallet/bookings, rewards, watched progress, share/privacy, notifications, account/security, sign-out, and delete-account actions, so that I can manage my relationship with the platform.
35. As an owner/admin, I want the full admin workspace to follow the supplied profile-page visual direction while keeping operational controls clear, so that administration matches the brand.
36. As a customer, I want the experience to work on mobile and desktop with accessible controls and readable contrast, so that I can browse, play, share, and book on my device.

## Implementation Decisions

- Use MarvelSyllabus as the customer-facing brand and “Burden with Glorious Syllabus” as its tagline.
- Treat the three supplied Figma Make references as the design source for their respective surfaces: Movie Booking Interface for the main movie experience, Music Festival Landing Page for the game, and User Profile Page for the full admin workspace and customer profile card. Adapt their compositions to the platform's real catalog and controls rather than copying placeholder content.
- Preserve the combined 57-film/4-series catalog, global admin-managed watch order, Upcoming/active behavior, series labels, per-series episode lists, individual-episode progress, and chronological screening ordering defined by the movie-ticketing platform specification.
- Add “Play & Earn Rewards” to the customer navigation and use it to open the existing game experience. Preserve its current game mechanics and visual direction; do not add unrelated game modes.
- A reward campaign is manually activated/deactivated; only one campaign accepts new enrollments at a time. Admins select exactly one reward offer per campaign. A new campaign may begin while prior campaign cohorts finish; overlap is on by default but can be disabled per campaign. A customer may participate in overlapping campaigns only when independently eligible for each.
- Require sign-in and a confirmed paid booking order for campaign enrollment. A complimentary ticket does not qualify. One customer can enroll once per campaign regardless of ticket quantity or additional paid orders in that campaign. A cancellation/refund before reward claim removes unclaimed game access and releases the reservation; an already granted reward is not revoked by that access check.
- Count a game play when the supplied 30-second round reaches its results/finished state. The claim action acknowledges/reveals the already-granted reward; it does not determine whether the round counted. Enforce up to three completed plays per campaign and reward grant on the shared backend, not browser state.
- Reserve the selected campaign reward when the customer starts their first round. The reservation and progress expire after the admin-configured completion window, default seven days from the first round. A started round that fails to complete releases its short-lived round reservation after two minutes, without releasing the campaign reward reservation. A reservation is granted exactly once on the third completed round.
- When a customer claims the campaign reward, hide that campaign's customer-facing Play & Earn entry point. An eligible later campaign may show a new entry point.
- Store campaigns, campaign reward selection/caps, paid-order eligibility, per-account enrollment and progress, round reservations, code pools, reward grants, and redemption state in the shared database. Make campaign completion, code allocation, and reward issuance idempotent and safe under concurrent requests.
- Campaign reward inventory is bounded. Native ticket rewards have a fixed cap; a cap cannot be raised after creation, so the operator starts a new campaign to offer more. For a food-coupon offer, an admin enters a pool of unique codes with optional expiry dates. Each reserved winner gets one unused code whose validity covers the enrollment's completion window; when none remain, stop new enrollments while honoring existing reservations. Adding codes resumes enrollment automatically unless the campaign was manually paused/deactivated. Manual pause/deactivation blocks new enrollment but lets existing enrolled customers finish within their completion window. No scheduled campaign start/end is required.
- Do not integrate with or claim validation by dwrpar.com; partner coupon redemption occurs on the partner service. The customer reward expiry is an admin-configured duration from grant; a partner code's expiry, if entered, is the earlier effective expiry.
- Support a complimentary ticket for a screening explicitly designated eligible by admin, and discounts of 30% or 50% applied to one eligible ticket. Remaining tickets in a multi-ticket order are full price. Apply platform-issued ticket rewards automatically to the next eligible checkout, show the adjusted total before payment, and consume the benefit atomically with a successful booking. Apply at most one platform reward per order, choosing the eligible unexpired reward with earliest expiry first.
- The profile card can be downloaded/shared as a rendered image only; there is no public profile page. Include only the customer-selected watched/streak fields, and never include bookings, profile details, or account identity. Use explicit share/privacy controls; do not publish watch data by default.
- Define a viewing streak as consecutive Asia/Kolkata calendar days on which the customer has at least one watched film/episode mark. Multiple marks on one day count as one streak day; removing a watched mark removes that title/episode and recalculates the streak from remaining marks.
- Store one operator-configured QR destination URL and render the same destination in every profile-card QR. The QR must not contain account identifiers, private profile data, or authentication credentials. If no destination is configured, omit the QR rather than rendering a nonfunctional code.
- Provide account settings for profile details, privacy/share-card controls, notification preferences, sign-in/security via the existing identity provider, and sign-out. Identity credentials remain managed by the identity provider.
- Load the game experience only when opened, lazy-load catalog/profile artwork, and avoid bundling the watchlist JSON or the large Figma Make source archives into the customer application. Use responsive layouts, keyboard/touch-operable controls, visible focus, adequate contrast, and reduced-motion behavior for animation.
- Keep the existing booking constraints, payment verification, ticket wallet, and administrative authorization rules unchanged. Game rewards must not bypass server-side title activation, screening availability, inventory holds, or payment verification.

## Testing Decisions

- Test observable customer and operator behavior through one end-to-end acceptance seam across the customer and admin web experiences and shared API, backed by a disposable database. Use deterministic game completion/results and a payment stub or existing test-mode payment setup.
- Verify the game entry point is hidden without a qualifying confirmed paid booking and after its campaign reward is claimed; verify that cancellation/refund before claim removes unclaimed access and reservation, and that a complimentary booking does not qualify.
- Verify one enrollment per account and campaign regardless of order quantity/repeat purchase, exactly three completed plays, results-state completion accounting, uncompleted-round timeout, first-play reward reservation, completion-window expiry, and exactly one reward grant.
- Verify one enrolling campaign at a time, optional overlap with prior finishing cohorts, customer participation in separate eligible campaigns, pause/deactivation behavior, exhaustion, code-pool replenishment, and fixed reward caps.
- Verify admin reward/campaign configuration, manual partner-code entry and per-code expiry, reward reservation/assignment, display of instructions and expiry, one-ticket discount math, designated free-premiere eligibility, earliest-expiry reward selection, and one-time redemption.
- Verify two accounts cannot redeem the same assigned reward, concurrent checkout cannot consume a reward twice, and an inactive title or unavailable screening cannot be booked through a reward.
- Verify the profile card image includes only opted-in watched/streak information, never bookings/profile identity, no public profile endpoint is exposed, the same configured destination is encoded for all cards, and no personal data is encoded in the QR.
- Verify series episode progress, unmark behavior, and streak updates, including multiple watch marks on one Asia/Kolkata date and activity on consecutive versus skipped dates.
- Verify responsive/accessibility behavior for navigation, game controls, reward status, settings, and card sharing at the customer-facing seam.
- Existing Vitest tests for catalog ordering and screening availability are prior art for deterministic behavior checks; they are not a substitute for the agreed end-to-end acceptance coverage.

## Out of Scope

- A new game concept, new game modes, or a redesign of the existing game mechanics beyond applying the supplied visual reference and adding account-backed play/reward fulfillment.
- A dwrpar.com API integration, automatic partner-code validation, or partner-side purchase/refund workflows.
- Public searchable profile pages, public access to full watch histories, or per-user QR destinations.
- Social feeds, friend/follower graphs, messaging, recommendations, or public leaderboards.
- General-purpose promo campaigns unrelated to the earned rewards described here.
- Changes to ticket pricing, live payment enablement, screening capacity, payment-provider integration, or ticket refund policy.
- Native mobile applications.

## Further Notes

- The three visual references are supplied as Figma Make project files. The movie, game, and profile surfaces should retain their distinct visual directions while sharing the MarvelSyllabus brand, accessible interaction patterns, and existing platform navigation.
- This specification extends the existing movie-ticketing platform scope: detailed visual treatment for the named surfaces and earned rewards are now included, while broader coupon campaigns and third-party coupon validation remain out of scope.
- The supplied game source is a 30-second Temporal Loom round. Its current claim screen awards only a fixed title and has no account login, persistence, play limit, actual reward selection, or completion API. Integrate the agreed backend campaign entitlement rather than treating the prototype's local claim screen as a real reward.
- Campaign reward selection is not random: the owner chooses the single offer for that campaign, and every enrolled customer reserves that configured reward within the campaign's available capacity.
- Campaign eligibility requires a confirmed paid booking order, is account-scoped, and permits at most one entry per customer per campaign even if the customer places more eligible orders.
- A customer earns up to one reward per campaign by completing three rounds within the campaign's configured window. The campaign's Play & Earn entry point disappears after the reward is claimed. If an eligible new campaign later starts, a new entry may appear.
- Admins decide whether the next campaign may accept new enrollments while an earlier campaign's enrolled customers finish. The default is to allow this overlap; still only one campaign may accept new enrollments at a time.
- Profile sharing is an image export, not a hosted profile URL. The exported image includes only explicitly selected watch-progress/streak data; profile identity and booking data are excluded. The QR is the same operator-configured destination on every card.

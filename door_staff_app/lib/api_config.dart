// Shared ticketing contract with the Pages Functions backend.
//
// The customer app (prototype) issues QR payloads shaped like
//   marvelsyllabus://ticket/MSY-XXXX-XXXX
// and prints the short MSY-XXXX-XXXX code underneath for manual entry.
// This config points the door app at the same backend the admin uses,
// so all three surfaces validate the same order codes.
//
// For a production build, pass --dart-define values (see README.md):
//   flutter build apk --release \
//     --dart-define=API_BASE_URL=https://<your-pages-domain> \
//     --dart-define=STAFF_TOKEN=<clerk-staff-jwt>
class ApiConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  static const staffToken = String.fromEnvironment('STAFF_TOKEN', defaultValue: '');

  static bool get isLive => apiBaseUrl.isNotEmpty && staffToken.isNotEmpty;
}

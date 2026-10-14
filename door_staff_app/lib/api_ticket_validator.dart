import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'screening.dart';
import 'ticket.dart';

/// Live validator against the shared Pages Functions backend.
///
/// Uses the same endpoints as the admin Command Deck:
///   GET  /api/staff/screenings  (tonight's screenings + door counts)
///   POST /api/staff/validate    (lookup, no state change)
///   POST /api/staff/check-in    (one-time check-in, idempotent)
///
/// The server is the source of truth for already-used detection, so two
/// doors scanning the same code cannot both admit it. [DemoTicketValidator]
/// remains as the offline fallback when no API is configured.
class ApiTicketValidator {
  ApiTicketValidator({
    required this.apiBaseUrl,
    required this.staffToken,
    http.Client? client,
    this.timeout = const Duration(seconds: 10),
  }) : _client = client ?? http.Client();

  final String apiBaseUrl;
  final String staffToken;
  final Duration timeout;
  final http.Client _client;

  static final _orderCodePattern = RegExp(r'MSY-[A-Z0-9]{4}-[A-Z0-9]{4}');

  /// Accepts the full customer QR payload
  /// (`marvelsyllabus://ticket/MSY-XXXX-XXXX`) or the raw manual-entry code.
  static String normalizeCode(String raw) {
    final match =
        _orderCodePattern.firstMatch(raw.trim().toUpperCase());
    if (match == null) throw const FormatException('invalid_code');
    return match.group(0)!;
  }

  Uri _uri(String path) =>
      Uri.parse('${apiBaseUrl.replaceAll(RegExp(r'/+$'), '')}$path');

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        'authorization': 'Bearer $staffToken',
      };

  Never _throwForStatus(int status) {
    if (status == 401 || status == 403) throw StateError('staff_unauthorized');
    throw StateError('request_failed_$status');
  }

  /// Tonight's screenings with live sold vs checked-in counts.
  Future<List<StaffScreening>> fetchScreenings() async {
    late http.Response response;
    try {
      response = await _client
          .get(_uri('/api/staff/screenings'), headers: _headers)
          .timeout(timeout);
    } on TimeoutException {
      throw StateError('request_timeout');
    } on SocketException {
      throw StateError('offline');
    }
    if (response.statusCode != 200) _throwForStatus(response.statusCode);
    final list = jsonDecode(response.body) as List<dynamic>;
    return list
        .map((item) => StaffScreening.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Look up a ticket without changing its state (preview before admitting).
  Future<TicketCheckResult> validate(String rawCode) async {
    final code = normalizeCode(rawCode);
    late http.Response response;
    try {
      response = await _client
          .post(_uri('/api/staff/validate'),
              headers: _headers, body: jsonEncode({'code': code}))
          .timeout(timeout);
    } on TimeoutException {
      throw StateError('request_timeout');
    } on SocketException {
      throw StateError('offline');
    }
    if (response.statusCode != 200) {
      if (response.statusCode == 404) {
        return TicketCheckResult(status: TicketStatus.invalid, code: code);
      }
      _throwForStatus(response.statusCode);
    }
    return _toResult(code, jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Admit a ticket. Idempotent: a re-scan returns [TicketStatus.alreadyUsed].
  Future<TicketCheckResult> checkIn(String rawCode) async {
    final code = normalizeCode(rawCode);
    late http.Response response;
    try {
      response = await _client
          .post(_uri('/api/staff/check-in'),
              headers: _headers, body: jsonEncode({'code': code}))
          .timeout(timeout);
    } on TimeoutException {
      throw StateError('request_timeout');
    } on SocketException {
      throw StateError('offline');
    }
    if (response.statusCode != 200) {
      if (response.statusCode == 404) {
        return TicketCheckResult(status: TicketStatus.invalid, code: code);
      }
      _throwForStatus(response.statusCode);
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    switch (body['status']) {
      case 'accepted':
        return TicketCheckResult(
          status: TicketStatus.accepted,
          code: code,
          ticket: _toTicket(code, null),
        );
      case 'already_used':
        return TicketCheckResult(
          status: TicketStatus.alreadyUsed,
          code: code,
          ticket: _toTicket(code, null),
        );
      default:
        return TicketCheckResult(status: TicketStatus.invalid, code: code);
    }
  }

  TicketCheckResult _toResult(String code, Map<String, dynamic> body) {
    switch (body['status']) {
      case 'valid':
        return TicketCheckResult(
          status: TicketStatus.accepted,
          code: code,
          ticket: _toTicket(code, body),
        );
      case 'already_used':
        return TicketCheckResult(
          status: TicketStatus.alreadyUsed,
          code: code,
          ticket: _toTicket(code, body),
        );
      default:
        return TicketCheckResult(status: TicketStatus.invalid, code: code);
    }
  }

  Ticket _toTicket(String code, Map<String, dynamic>? body) {
    return Ticket(
      code: code,
      guestName: (body?['title'] as String?) ?? 'Confirmed ticket',
      seat: (body?['location'] as String?) ?? 'Show ticket',
      ticketType: body?['quantity'] != null
          ? 'Qty ${body!['quantity']}'
          : 'Standard',
    );
  }
}

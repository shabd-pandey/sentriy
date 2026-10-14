import 'dart:convert';

import 'package:door_staff_app/api_ticket_validator.dart';
import 'package:door_staff_app/ticket.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('ApiTicketValidator.normalizeCode', () {
    test('accepts the full customer QR payload', () {
      expect(
        ApiTicketValidator.normalizeCode(
            'marvelsyllabus://ticket/msy-ab12-cd34'),
        'MSY-AB12-CD34',
      );
    });

    test('accepts the raw manual-entry code', () {
      expect(
        ApiTicketValidator.normalizeCode('  msy-ab12-cd34  '),
        'MSY-AB12-CD34',
      );
    });

    test('rejects legacy demo shapes', () {
      expect(
        () => ApiTicketValidator.normalizeCode('HORIZON-2048'),
        throwsA(isA<FormatException>()),
      );
    });
  });

  group('ApiTicketValidator.checkIn', () {
    MockClient clientFor(Object body, [int status = 200]) {
      return MockClient((request) async {
        expect(request.url.path, '/api/staff/check-in');
        expect(request.headers['authorization'], startsWith('Bearer '));
        final payload = jsonDecode(request.body) as Map<String, dynamic>;
        expect(payload['code'], 'MSY-AB12-CD34');
        return http.Response(jsonEncode(body), status);
      });
    }

    test('maps accepted to TicketStatus.accepted', () async {
      final validator = ApiTicketValidator(
        apiBaseUrl: 'https://tickets.example',
        staffToken: 'token',
        client: clientFor({'status': 'accepted', 'code': 'MSY-AB12-CD34'}),
      );

      final result = await validator.checkIn('MSY-AB12-CD34');

      expect(result.status, TicketStatus.accepted);
      expect(result.isAccepted, isTrue);
    });

    test('maps already_used to TicketStatus.alreadyUsed', () async {
      final validator = ApiTicketValidator(
        apiBaseUrl: 'https://tickets.example',
        staffToken: 'token',
        client: clientFor({'status': 'already_used', 'code': 'MSY-AB12-CD34'}),
      );

      final result = await validator.checkIn('MSY-AB12-CD34');

      expect(result.status, TicketStatus.alreadyUsed);
    });

    test('maps 404 to TicketStatus.invalid', () async {
      final validator = ApiTicketValidator(
        apiBaseUrl: 'https://tickets.example',
        staffToken: 'token',
        client: clientFor({'error': 'not_found'}, 404),
      );

      final result = await validator.checkIn('MSY-AB12-CD34');

      expect(result.status, TicketStatus.invalid);
    });

    test('fails closed on staff_unauthorized', () async {
      final validator = ApiTicketValidator(
        apiBaseUrl: 'https://tickets.example',
        staffToken: 'expired',
        client: clientFor({'error': 'forbidden'}, 403),
      );

      await expectLater(
        validator.checkIn('MSY-AB12-CD34'),
        throwsA(
          isStateError.having(
            (e) => e.message,
            'message',
            contains('staff_unauthorized'),
          ),
        ),
      );
    });
  });

  group('ApiTicketValidator.fetchScreenings', () {
    test('parses door counts', () async {
      final client = MockClient((request) async {
        expect(request.url.path, '/api/staff/screenings');
        return http.Response(
          jsonEncode([
            {
              'id': '00000000-0000-0000-0000-000000000001',
              'titleId': 'film-1',
              'title': 'Sample film',
              'startsAt': '2026-11-01T18:00:00.000Z',
              'endsAt': '2026-11-01T20:00:00.000Z',
              'location': 'Hall 1',
              'capacity': 100,
              'cancelled': false,
              'soldCount': 40,
              'checkedInCount': 12,
            },
          ]),
          200,
        );
      });
      final validator = ApiTicketValidator(
        apiBaseUrl: 'https://tickets.example',
        staffToken: 'token',
        client: client,
      );

      final screenings = await validator.fetchScreenings();

      expect(screenings, hasLength(1));
      expect(screenings.first.title, 'Sample film');
      expect(screenings.first.soldCount, 40);
      expect(screenings.first.checkedInCount, 12);
      expect(screenings.first.incrementCheckedIn().checkedInCount, 13);
    });
  });
}

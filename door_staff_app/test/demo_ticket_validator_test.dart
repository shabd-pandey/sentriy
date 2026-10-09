import 'package:door_staff_app/demo_ticket_validator.dart';
import 'package:door_staff_app/ticket.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DemoTicketValidator', () {
    test('accepts a valid ticket and normalizes its code', () {
      final validator = DemoTicketValidator();

      final result = validator.checkIn('  horizon-2048  ');

      expect(result.status, TicketStatus.accepted);
      expect(result.ticket?.guestName, 'Avery Morgan');
    });

    test('rejects a ticket that has already been checked in', () {
      final validator = DemoTicketValidator();

      validator.checkIn('HORIZON-2048');
      final secondResult = validator.checkIn('HORIZON-2048');

      expect(secondResult.status, TicketStatus.alreadyUsed);
    });

    test('rejects an unknown ticket code', () {
      final validator = DemoTicketValidator();

      final result = validator.checkIn('NOT-A-REAL-TICKET');

      expect(result.status, TicketStatus.invalid);
      expect(result.ticket, isNull);
    });
  });
}

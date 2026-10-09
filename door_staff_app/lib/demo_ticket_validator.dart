import 'ticket.dart';

class DemoTicketValidator {
  DemoTicketValidator()
      : _tickets = {
          for (final ticket in _demoTickets) ticket.code: ticket,
        };

  final Map<String, Ticket> _tickets;
  final Set<String> _checkedIn = {};

  TicketCheckResult checkIn(String rawCode) {
    final code = rawCode.trim().toUpperCase();
    final ticket = _tickets[code];

    if (ticket == null) {
      return TicketCheckResult(status: TicketStatus.invalid, code: code);
    }
    if (!_checkedIn.add(code)) {
      return TicketCheckResult(
        status: TicketStatus.alreadyUsed,
        code: code,
        ticket: ticket,
      );
    }

    return TicketCheckResult(
      status: TicketStatus.accepted,
      code: code,
      ticket: ticket,
    );
  }

  static const _demoTickets = [
    Ticket(
      code: 'HORIZON-2048',
      guestName: 'Avery Morgan',
      seat: 'B-12',
      ticketType: 'Premiere · Standard',
    ),
    Ticket(
      code: 'HORIZON-3902',
      guestName: 'Jordan Lee',
      seat: 'C-08',
      ticketType: 'Premiere · VIP',
    ),
    Ticket(
      code: 'HORIZON-7185',
      guestName: 'Sam Rivera',
      seat: 'A-03',
      ticketType: 'Premiere · Standard',
    ),
  ];
}

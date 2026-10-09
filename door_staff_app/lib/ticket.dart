enum TicketStatus { accepted, alreadyUsed, invalid }

class Ticket {
  const Ticket({
    required this.code,
    required this.guestName,
    required this.seat,
    required this.ticketType,
  });

  final String code;
  final String guestName;
  final String seat;
  final String ticketType;
}

class TicketCheckResult {
  const TicketCheckResult({
    required this.status,
    required this.code,
    this.ticket,
  });

  final TicketStatus status;
  final String code;
  final Ticket? ticket;

  bool get isAccepted => status == TicketStatus.accepted;
}

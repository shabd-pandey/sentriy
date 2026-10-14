/// A screening served by GET /api/staff/screenings — the same rows the
/// admin Command Deck reads, with live sold vs checked-in door counts.
class StaffScreening {
  const StaffScreening({
    required this.id,
    required this.titleId,
    required this.title,
    required this.startsAt,
    required this.endsAt,
    required this.location,
    required this.capacity,
    required this.cancelled,
    required this.soldCount,
    required this.checkedInCount,
  });

  final String id;
  final String titleId;
  final String title;
  final DateTime startsAt;
  final DateTime endsAt;
  final String location;
  final int capacity;
  final bool cancelled;
  final int soldCount;
  final int checkedInCount;

  factory StaffScreening.fromJson(Map<String, dynamic> json) {
    return StaffScreening(
      id: json['id'] as String,
      titleId: json['titleId'] as String,
      title: (json['title'] as String?) ?? 'Untitled screening',
      startsAt: DateTime.parse(json['startsAt'] as String),
      endsAt: DateTime.parse(json['endsAt'] as String),
      location: (json['location'] as String?) ?? '',
      capacity: (json['capacity'] as num?)?.toInt() ?? 0,
      cancelled: (json['cancelled'] as bool?) ?? false,
      soldCount: (json['soldCount'] as num?)?.toInt() ?? 0,
      checkedInCount: (json['checkedInCount'] as num?)?.toInt() ?? 0,
    );
  }

  StaffScreening incrementCheckedIn() => StaffScreening(
        id: id,
        titleId: titleId,
        title: title,
        startsAt: startsAt,
        endsAt: endsAt,
        location: location,
        capacity: capacity,
        cancelled: cancelled,
        soldCount: soldCount,
        checkedInCount: checkedInCount + 1,
      );
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'demo_ticket_validator.dart';
import 'ticket.dart';

const _surface = Color(0xFF141A1F);
const _muted = Color(0xFF8F9AA3);
const _accent = Color(0xFFB8F36B);
const _green = Color(0xFF67E3A1);
const _red = Color(0xFFFF7474);

class CheckInScreen extends StatefulWidget {
  const CheckInScreen({super.key});

  @override
  State<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends State<CheckInScreen> {
  final _validator = DemoTicketValidator();
  final _scanner = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
  );
  final List<_RecentCheckIn> _recentCheckIns = [];

  TicketCheckResult? _latestResult;
  bool _processingScan = false;
  int _checkedInCount = 128;
  static const _capacity = 240;

  @override
  void dispose() {
    _scanner.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_processingScan) return;
    for (final barcode in capture.barcodes) {
      final code = barcode.rawValue;
      if (code != null && code.trim().isNotEmpty) {
        _checkTicket(code);
        return;
      }
    }
  }

  void _checkTicket(String code) {
    if (!mounted || _processingScan) return;
    _processingScan = true;
    unawaited(_scanner.stop());

    final result = _validator.checkIn(code);
    setState(() {
      _latestResult = result;
      if (result.isAccepted) _checkedInCount++;
      _recentCheckIns.insert(
        0,
        _RecentCheckIn(result: result, checkedAt: DateTime.now()),
      );
      if (_recentCheckIns.length > 4) _recentCheckIns.removeLast();
    });
  }

  Future<void> _resumeScanning() async {
    setState(() {
      _latestResult = null;
      _processingScan = false;
    });
    await _scanner.start();
  }

  Future<void> _showManualEntry() async {
    await _scanner.stop();
    if (!mounted) return;

    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: _surface,
        title: const Text('Enter ticket code'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          textInputAction: TextInputAction.done,
          onSubmitted: (value) => Navigator.pop(dialogContext, value),
          decoration: const InputDecoration(
            hintText: 'e.g. HORIZON-2048',
            prefixIcon: Icon(Icons.confirmation_number_outlined),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text),
            child: const Text('Check ticket'),
          ),
        ],
      ),
    );
    controller.dispose();

    if (!mounted) return;
    if (code == null) {
      if (_latestResult == null) await _scanner.start();
      return;
    }
    _processingScan = false;
    _checkTicket(code);
  }

  @override
  Widget build(BuildContext context) {
    final progress = _checkedInCount / _capacity;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _buildAppBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                children: [
                  _buildDemoNotice(),
                  const SizedBox(height: 24),
                  _buildEventHeader(),
                  const SizedBox(height: 20),
                  _buildCheckInStats(progress),
                  const SizedBox(height: 20),
                  _buildScanner(),
                  const SizedBox(height: 14),
                  _buildManualEntryButton(),
                  const SizedBox(height: 28),
                  _buildRecentActivity(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: _accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.qr_code_scanner, color: _accent, size: 21),
          ),
          const SizedBox(width: 11),
          const Text(
            'GATEKEEPER',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.8,
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
            decoration: BoxDecoration(
              color: _green.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: _green.withValues(alpha: 0.24)),
            ),
            child: const Row(
              children: [
                Icon(Icons.circle, color: _green, size: 7),
                SizedBox(width: 6),
                Text(
                  'GATE A',
                  style: TextStyle(
                    color: _green,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDemoNotice() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF211C12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF514024)),
      ),
      child: const Row(
        children: [
          Icon(Icons.info_outline, color: _accent, size: 16),
          SizedBox(width: 9),
          Expanded(
            child: Text(
              'DEMO MODE  ·  Connect a ticketing service for live validation',
              style: TextStyle(
                color: Color(0xFFE0C88F),
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEventHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'TONIGHT’S EVENT',
          style: TextStyle(
            color: _accent,
            fontSize: 10,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.6,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'The Last Horizon',
          style: TextStyle(fontSize: 27, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 5),
        Row(
          children: [
            const Icon(Icons.movie_outlined, size: 15, color: _muted),
            const SizedBox(width: 6),
            const Text(
              'Premiere screening',
              style: TextStyle(color: _muted, fontSize: 13),
            ),
            const SizedBox(width: 10),
            Container(
              width: 3,
              height: 3,
              decoration: const BoxDecoration(
                color: _muted,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 10),
            const Icon(Icons.schedule, size: 14, color: _muted),
            const SizedBox(width: 5),
            const Text(
              '7:30 PM',
              style: TextStyle(color: _muted, fontSize: 13),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildCheckInStats(double progress) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.groups_2_outlined, color: _muted, size: 18),
              const SizedBox(width: 8),
              const Text(
                'GUESTS CHECKED IN',
                style: TextStyle(
                  color: _muted,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.1,
                ),
              ),
              const Spacer(),
              Text(
                '$_checkedInCount',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                ' / $_capacity',
                style: const TextStyle(color: _muted, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 13),
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: LinearProgressIndicator(
              value: progress.clamp(0, 1).toDouble(),
              minHeight: 5,
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              valueColor: const AlwaysStoppedAnimation(_accent),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScanner() {
    final latestResult = _latestResult;

    return Container(
      height: 246,
      decoration: BoxDecoration(
        color: const Color(0xFF101519),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      clipBehavior: Clip.antiAlias,
      child: latestResult == null
          ? Stack(
              fit: StackFit.expand,
              children: [
                MobileScanner(controller: _scanner, onDetect: _onDetect),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.22),
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.55),
                      ],
                    ),
                  ),
                ),
                Center(child: _buildScanFrame()),
                const Positioned(
                  top: 14,
                  left: 14,
                  child: _ScannerLabel(
                    icon: Icons.center_focus_strong,
                    label: 'SCAN TICKET QR',
                  ),
                ),
                const Positioned(
                  bottom: 14,
                  left: 0,
                  right: 0,
                  child: Text(
                    'Align the QR code inside the frame',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      shadows: [Shadow(blurRadius: 8, color: Colors.black)],
                    ),
                  ),
                ),
              ],
            )
          : _buildResult(latestResult),
    );
  }

  Widget _buildScanFrame() {
    const length = 28.0;
    const thickness = 3.0;
    const color = _accent;

    Widget corner({
      required bool top,
      required bool left,
    }) {
      return SizedBox(
        width: length,
        height: length,
        child: CustomPaint(
          painter: _CornerPainter(
            color: color,
            length: length,
            thickness: thickness,
            top: top,
            left: left,
          ),
        ),
      );
    }

    return SizedBox(
      width: 190,
      height: 150,
      child: Stack(
        children: [
          Positioned(top: 0, left: 0, child: corner(top: true, left: true)),
          Positioned(top: 0, right: 0, child: corner(top: true, left: false)),
          Positioned(bottom: 0, left: 0, child: corner(top: false, left: true)),
          Positioned(
            bottom: 0,
            right: 0,
            child: corner(top: false, left: false),
          ),
        ],
      ),
    );
  }

  Widget _buildResult(TicketCheckResult result) {
    final accepted = result.status == TicketStatus.accepted;
    final alreadyUsed = result.status == TicketStatus.alreadyUsed;
    final color = accepted ? _green : (alreadyUsed ? _accent : _red);
    final icon = accepted
        ? Icons.check_circle_outline
        : (alreadyUsed ? Icons.warning_amber_rounded : Icons.cancel_outlined);
    final title = accepted
        ? 'You’re all set'
        : (alreadyUsed ? 'Already checked in' : 'Ticket not found');
    final ticket = result.ticket;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      color: color.withValues(alpha: 0.055),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 37),
          const SizedBox(height: 8),
          Text(
            title,
            style: TextStyle(
                color: color, fontSize: 19, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            ticket?.guestName ?? 'No matching ticket for this event',
            style: const TextStyle(color: Colors.white, fontSize: 13),
          ),
          if (ticket != null) ...[
            const SizedBox(height: 3),
            Text(
              '${ticket.ticketType}  ·  Seat ${ticket.seat}',
              style: const TextStyle(color: _muted, fontSize: 11),
            ),
          ],
          const SizedBox(height: 5),
          Text(
            result.code.isEmpty ? 'Empty code' : result.code,
            style: TextStyle(
              color: color.withValues(alpha: 0.82),
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _resumeScanning,
            icon: const Icon(Icons.qr_code_scanner, size: 17),
            label: const Text('Scan next ticket'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: BorderSide(color: Colors.white.withValues(alpha: 0.22)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildManualEntryButton() {
    return SizedBox(
      height: 50,
      child: OutlinedButton.icon(
        onPressed: _showManualEntry,
        icon: const Icon(Icons.keyboard_outlined, size: 18),
        label: const Text(
          'Enter ticket code manually',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
        style: OutlinedButton.styleFrom(
          foregroundColor: Colors.white,
          side: BorderSide(color: Colors.white.withValues(alpha: 0.13)),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }

  Widget _buildRecentActivity() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'Recent scans',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const Spacer(),
            Text(
              '${_recentCheckIns.length} ${_recentCheckIns.length == 1 ? 'scan' : 'scans'}',
              style: const TextStyle(color: _muted, fontSize: 11),
            ),
          ],
        ),
        const SizedBox(height: 12),
        if (_recentCheckIns.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 19, horizontal: 14),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
            ),
            child: const Row(
              children: [
                Icon(Icons.history, color: _muted, size: 18),
                SizedBox(width: 10),
                Text(
                  'Scanned tickets will appear here',
                  style: TextStyle(color: _muted, fontSize: 12),
                ),
              ],
            ),
          )
        else
          ..._recentCheckIns.map(_buildRecentRow),
      ],
    );
  }

  Widget _buildRecentRow(_RecentCheckIn item) {
    final result = item.result;
    final accepted = result.status == TicketStatus.accepted;
    final color = accepted
        ? _green
        : (result.status == TicketStatus.alreadyUsed ? _accent : _red);
    final guest = result.ticket?.guestName ?? 'Unknown ticket';
    final label = accepted
        ? 'Admitted'
        : (result.status == TicketStatus.alreadyUsed
            ? 'Duplicate'
            : 'Not found');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.11),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(
              accepted ? Icons.check : Icons.block_outlined,
              color: color,
              size: 17,
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  guest,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 3),
                Text(
                  result.ticket?.seat ?? result.code,
                  style: const TextStyle(color: _muted, fontSize: 10),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                _formatTime(item.checkedAt),
                style: const TextStyle(color: _muted, fontSize: 10),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime dateTime) {
    final hour = dateTime.hour % 12 == 0 ? 12 : dateTime.hour % 12;
    final minute = dateTime.minute.toString().padLeft(2, '0');
    final period = dateTime.hour < 12 ? 'AM' : 'PM';
    return '$hour:$minute $period';
  }
}

class _ScannerLabel extends StatelessWidget {
  const _ScannerLabel({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.57),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        children: [
          Icon(icon, color: _accent, size: 14),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.7,
            ),
          ),
        ],
      ),
    );
  }
}

class _CornerPainter extends CustomPainter {
  const _CornerPainter({
    required this.color,
    required this.length,
    required this.thickness,
    required this.top,
    required this.left,
  });

  final Color color;
  final double length;
  final double thickness;
  final bool top;
  final bool left;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = thickness
      ..strokeCap = StrokeCap.round;
    final x = left ? 0.0 : size.width;
    final y = top ? 0.0 : size.height;
    final xEnd = left ? length : size.width - length;
    final yEnd = top ? length : size.height - length;
    canvas.drawLine(Offset(x, y), Offset(xEnd, y), paint);
    canvas.drawLine(Offset(x, y), Offset(x, yEnd), paint);
  }

  @override
  bool shouldRepaint(covariant _CornerPainter oldDelegate) {
    return color != oldDelegate.color ||
        length != oldDelegate.length ||
        thickness != oldDelegate.thickness ||
        top != oldDelegate.top ||
        left != oldDelegate.left;
  }
}

class _RecentCheckIn {
  const _RecentCheckIn({required this.result, required this.checkedAt});

  final TicketCheckResult result;
  final DateTime checkedAt;
}

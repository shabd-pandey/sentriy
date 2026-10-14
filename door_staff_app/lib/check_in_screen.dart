import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';

import 'api_config.dart';
import 'api_ticket_validator.dart';
import 'demo_ticket_validator.dart';
import 'screening.dart';
import 'ticket.dart';

const _surface = Color(0xFF141A1F);
const _muted = Color(0xFF8F9AA3);
const _accent = Color(0xFFB8F36B);
const _green = Color(0xFF67E3A1);
const _red = Color(0xFFFF7474);

enum _CameraState { checking, granted, denied, blocked }

class CheckInScreen extends StatefulWidget {
  const CheckInScreen({super.key});

  @override
  State<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends State<CheckInScreen> {
  final _demoValidator = DemoTicketValidator();
  ApiTicketValidator? _liveValidator;
  MobileScannerController? _scanner;
  Timer? _countsTimer;
  final List<_RecentCheckIn> _recentCheckIns = [];

  _CameraState _camera = _CameraState.checking;
  TicketCheckResult? _latestResult;
  bool _processingScan = false;
  String? _bannerError;

  // Live event state (replaces the old hard-coded demo header).
  List<StaffScreening> _screenings = [];
  String? _selectedScreeningId;
  bool _loadingScreenings = false;

  // Demo-mode local counters (offline rehearsal only).
  int _demoCheckedIn = 0;
  static const _demoCapacity = 240;

  bool get _isLive => _liveValidator != null;

  StaffScreening? get _selectedScreening {
    for (final screening in _screenings) {
      if (screening.id == _selectedScreeningId) return screening;
    }
    return _screenings.isEmpty ? null : _screenings.first;
  }

  int get _checkedInCount =>
      _isLive ? (_selectedScreening?.checkedInCount ?? 0) : _demoCheckedIn;

  int get _capacity =>
      _isLive ? (_selectedScreening?.capacity ?? 0) : _demoCapacity;

  @override
  void initState() {
    super.initState();
    if (ApiConfig.isLive) {
      _liveValidator = ApiTicketValidator(
        apiBaseUrl: ApiConfig.apiBaseUrl,
        staffToken: ApiConfig.staffToken,
      );
    }
    unawaited(_requestCamera());
    if (_isLive) {
      unawaited(_loadScreenings());
      _countsTimer = Timer.periodic(
        const Duration(seconds: 20),
        (_) => _refreshCounts(silent: true),
      );
    }
  }

  @override
  void dispose() {
    _countsTimer?.cancel();
    _scanner?.dispose();
    super.dispose();
  }

  // ---- Camera permission (the release-build black-screen fix) ----
  //
  // Declaring CAMERA in AndroidManifest.xml is necessary but not sufficient:
  // Android also requires a runtime grant. The scanner is only created after
  // the grant, and every non-granted state gets an actionable screen instead
  // of a black viewfinder.

  Future<void> _requestCamera() async {
    final status = await Permission.camera.status;
    if (!mounted) return;
    if (status.isGranted || status.isLimited) {
      _grantCamera();
      return;
    }
    if (status.isPermanentlyDenied || status.isRestricted) {
      setState(() => _camera = _CameraState.blocked);
      return;
    }
    final requested = await Permission.camera.request();
    if (!mounted) return;
    if (requested.isGranted || requested.isLimited) {
      _grantCamera();
    } else if (requested.isPermanentlyDenied || requested.isRestricted) {
      setState(() => _camera = _CameraState.blocked);
    } else {
      setState(() => _camera = _CameraState.denied);
    }
  }

  void _grantCamera() {
    _scanner ??= MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      formats: const [BarcodeFormat.qrCode],
    );
    setState(() => _camera = _CameraState.granted);
  }

  // ---- Live screenings (same rows the admin Command Deck reads) ----

  Future<void> _loadScreenings() async {
    final live = _liveValidator;
    if (live == null) return;
    setState(() {
      _loadingScreenings = true;
      _bannerError = null;
    });
    try {
      final screenings = await live.fetchScreenings();
      if (!mounted) return;
      setState(() {
        _screenings = screenings;
        _selectedScreeningId ??= screenings.isEmpty ? null : screenings.first.id;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _bannerError = _friendlyError(e));
    } finally {
      if (mounted) setState(() => _loadingScreenings = false);
    }
  }

  Future<void> _refreshCounts({bool silent = false}) async {
    final live = _liveValidator;
    if (live == null) return;
    try {
      final screenings = await live.fetchScreenings();
      if (!mounted) return;
      setState(() {
        _screenings = screenings;
        if (_selectedScreeningId != null &&
            screenings.every((s) => s.id != _selectedScreeningId)) {
          _selectedScreeningId =
              screenings.isEmpty ? null : screenings.first.id;
        }
        if (!silent) _bannerError = null;
      });
    } catch (e) {
      if (!mounted || silent) return;
      setState(() => _bannerError = _friendlyError(e));
    }
  }

  String _friendlyError(Object e) {
    final message = e is StateError ? e.message : e.toString();
    if (message.contains('staff_unauthorized')) {
      return 'Staff session expired or not staff — rebuild with a fresh STAFF_TOKEN.';
    }
    if (message.contains('offline')) {
      return 'No connection to the ticketing service. Check venue network.';
    }
    if (message.contains('request_timeout')) {
      return 'Ticketing service is slow — retrying. Scans queue locally.';
    }
    return 'Live data unavailable ($message).';
  }

  // ---- Scanning ----

  void _onDetect(BarcodeCapture capture) {
    if (_processingScan) return;
    for (final barcode in capture.barcodes) {
      final code = barcode.rawValue;
      if (code != null && code.trim().isNotEmpty) {
        unawaited(_checkTicket(code));
        return;
      }
    }
  }

  Future<void> _checkTicket(String code) async {
    if (!mounted || _processingScan) return;
    _processingScan = true;
    await _scanner?.stop();

    final live = _liveValidator;
    if (live == null) {
      _applyResult(_demoValidator.checkIn(code));
      return;
    }
    try {
      final result = await live.checkIn(code);
      if (!mounted) return;
      setState(() => _bannerError = null);
      _applyResult(result, countLocally: true);
      if (result.isAccepted) unawaited(_refreshCounts(silent: true));
    } on FormatException {
      _applyResult(
        TicketCheckResult(
          status: TicketStatus.invalid,
          code: code.trim().toUpperCase(),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final message = e is StateError ? e.message : '';
      if (message.contains('staff_unauthorized')) {
        // Fail closed: never admit on an auth error, and never silently
        // fall back to the demo list (that would admit fake tickets).
        setState(
          () => _bannerError =
              'Staff session expired or not staff — rebuild with a fresh STAFF_TOKEN.',
        );
        _applyResult(
          TicketCheckResult(
            status: TicketStatus.invalid,
            code: code.trim().toUpperCase(),
          ),
        );
        return;
      }
      // Network/timeout only: keep the door moving on the demo list but say
      // so loudly — staff must re-scan these codes once back online.
      setState(
        () => _bannerError =
            'Live validation failed — DEMO fallback used. Re-scan these codes when online.',
      );
      _applyResult(_demoValidator.checkIn(code));
    }
  }

  void _applyResult(TicketCheckResult result, {bool countLocally = false}) {
    if (!mounted) return;
    setState(() {
      _latestResult = result;
      if (result.isAccepted) {
        if (_isLive && countLocally) {
          final selected = _selectedScreening;
          if (selected != null) {
            final index =
                _screenings.indexWhere((s) => s.id == selected.id);
            if (index != -1) {
              _screenings[index] = selected.incrementCheckedIn();
            }
          }
        } else if (!_isLive) {
          _demoCheckedIn++;
        }
      }
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
    if (_camera == _CameraState.granted) await _scanner?.start();
  }

  Future<void> _showManualEntry() async {
    await _scanner?.stop();
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
            hintText: 'e.g. MSY-AB12-CD34',
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
      if (_latestResult == null && _camera == _CameraState.granted) {
        await _scanner?.start();
      }
      return;
    }
    _processingScan = false;
    await _checkTicket(code);
  }

  @override
  Widget build(BuildContext context) {
    final capacity = _capacity;
    final progress = capacity > 0 ? _checkedInCount / capacity : 0.0;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _buildAppBar(),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                children: [
                  _buildModeBanner(),
                  if (_bannerError != null) ...[
                    const SizedBox(height: 10),
                    _buildErrorBanner(_bannerError!),
                  ],
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

  Widget _buildModeBanner() {
    final live = _isLive;
    final message = live
        ? 'LIVE MODE  ·  Validating against the shared ticketing service'
        : 'DEMO MODE  ·  Rehearsal only — build with API_BASE_URL + STAFF_TOKEN for doors';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF211C12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF514024)),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, color: _accent, size: 16),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
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

  Widget _buildErrorBanner(String message) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF2A1414),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF5A2626)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: _red, size: 16),
          const SizedBox(width: 9),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(
                color: Color(0xFFF0B9B9),
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
    if (!_isLive) {
      return const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'DEMO EVENT · REHEARSAL ONLY',
            style: TextStyle(
              color: _accent,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.6,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'The Last Horizon',
            style: TextStyle(fontSize: 27, fontWeight: FontWeight.w700),
          ),
          SizedBox(height: 5),
          Text(
            'Sample data — live screenings appear once the API is configured.',
            style: TextStyle(color: _muted, fontSize: 13),
          ),
        ],
      );
    }
    if (_loadingScreenings && _screenings.isEmpty) {
      return const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TONIGHT',
            style: TextStyle(
              color: _accent,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.6,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Loading screenings…',
            style: TextStyle(fontSize: 27, fontWeight: FontWeight.w700),
          ),
        ],
      );
    }
    final selected = _selectedScreening;
    if (selected == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'TONIGHT',
            style: TextStyle(
              color: _accent,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.6,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'No screenings found',
            style: TextStyle(fontSize: 27, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 5),
          const Text(
            'Schedule one in the Command Deck first.',
            style: TextStyle(color: _muted, fontSize: 13),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _loadScreenings,
            icon: const Icon(Icons.refresh, size: 17),
            label: const Text('Retry'),
            style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
          ),
        ],
      );
    }
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
        DropdownButton<String>(
          value: selected.id,
          isExpanded: true,
          dropdownColor: _surface,
          style: const TextStyle(
            fontSize: 27,
            fontWeight: FontWeight.w700,
            color: Colors.white,
          ),
          underline: const SizedBox.shrink(),
          items: _screenings
              .map(
                (s) => DropdownMenuItem(
                  value: s.id,
                  child: Text(
                    s.title,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              )
              .toList(),
          onChanged: (id) {
            if (id == null) return;
            setState(() {
              _selectedScreeningId = id;
              _latestResult = null;
              _processingScan = false;
            });
            unawaited(_refreshCounts(silent: true));
          },
        ),
        const SizedBox(height: 5),
        Row(
          children: [
            const Icon(Icons.schedule, size: 14, color: _muted),
            const SizedBox(width: 5),
            Text(
              _formatDateTime(selected.startsAt),
              style: const TextStyle(color: _muted, fontSize: 13),
            ),
            const SizedBox(width: 10),
            const Icon(Icons.location_on_outlined, size: 14, color: _muted),
            const SizedBox(width: 5),
            Expanded(
              child: Text(
                selected.location,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: _muted, fontSize: 13),
              ),
            ),
            if (selected.cancelled)
              const Text(
                'CANCELLED',
                style: TextStyle(
                  color: _red,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                ),
              ),
          ],
        ),
      ],
    );
  }

  String _formatDateTime(DateTime value) {
    final local = value.toLocal();
    final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final minute = local.minute.toString().padLeft(2, '0');
    final period = local.hour < 12 ? 'AM' : 'PM';
    return '${local.day}/${local.month} · $hour:$minute $period';
  }

  Widget _buildCheckInStats(double progress) {
    final capacity = _capacity;
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
              if (_isLive)
                IconButton(
                  onPressed: () => unawaited(_refreshCounts()),
                  icon: const Icon(Icons.refresh, color: _muted, size: 18),
                  tooltip: 'Refresh counts',
                ),
              Text(
                '$_checkedInCount',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                ' / $capacity',
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
          if (_isLive && _selectedScreening != null) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${_selectedScreening!.soldCount} confirmed tickets · counts refresh every 20s',
                style: const TextStyle(color: _muted, fontSize: 11),
              ),
            ),
          ],
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
      child: switch (_camera) {
        _CameraState.checking => const Center(
            child: CircularProgressIndicator(color: _accent),
          ),
        _CameraState.denied => _buildPermissionPrompt(
            title: 'Camera access needed',
            body:
                'Gatekeeper scans ticket QR codes with the camera. Allow access to start scanning.',
            actionLabel: 'Allow camera access',
            onAction: _requestCamera,
          ),
        _CameraState.blocked => _buildPermissionPrompt(
            title: 'Camera access is off',
            body:
                'Camera permission was blocked. Enable it in the system Settings, then return here.',
            actionLabel: 'Open Settings',
            onAction: () async {
              await openAppSettings();
            },
          ),
        _CameraState.granted => latestResult == null
            ? Stack(
                fit: StackFit.expand,
                children: [
                  MobileScanner(
                    controller: _scanner,
                    onDetect: _onDetect,
                    errorBuilder: (context, error) => _buildScannerError(
                      'Scanner error (${error.errorCode}). Tap to retry.',
                    ),
                  ),
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
                  Positioned(
                    top: 10,
                    right: 10,
                    child: IconButton(
                      onPressed: () => unawaited(_scanner?.toggleTorch()),
                      icon: const Icon(Icons.flashlight_on_outlined,
                          color: Colors.white),
                      tooltip: 'Toggle torch',
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
      },
    );
  }

  Widget _buildPermissionPrompt({
    required String title,
    required String body,
    required String actionLabel,
    required Future<void> Function() onAction,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.videocam_off_outlined, color: _accent, size: 37),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            body,
            textAlign: TextAlign.center,
            style: const TextStyle(color: _muted, fontSize: 12),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () => unawaited(onAction()),
            icon: const Icon(Icons.camera_alt_outlined, size: 17),
            label: Text(actionLabel),
            style: FilledButton.styleFrom(
              backgroundColor: _accent,
              foregroundColor: Colors.black,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildScannerError(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      color: _red.withValues(alpha: 0.06),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: _red, size: 37),
          const SizedBox(height: 10),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white, fontSize: 13),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: _resumeScanning,
            icon: const Icon(Icons.refresh, size: 17),
            label: const Text('Retry scanner'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white,
              side: BorderSide(color: Colors.white.withValues(alpha: 0.22)),
            ),
          ),
        ],
      ),
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

import 'package:flutter/material.dart';

import 'check_in_screen.dart';

void main() {
  runApp(const DoorStaffApp());
}

class DoorStaffApp extends StatelessWidget {
  const DoorStaffApp({super.key});

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFF0B0F12);
    const surface = Color(0xFF141A1F);
    const accent = Color(0xFFB8F36B);

    return MaterialApp(
      title: 'Gatekeeper',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: background,
        colorScheme: const ColorScheme.dark(
          primary: accent,
          secondary: accent,
          surface: surface,
          error: Color(0xFFFF7474),
        ),
        useMaterial3: true,
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: background,
          foregroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
        ),
      ),
      home: const CheckInScreen(),
    );
  }
}

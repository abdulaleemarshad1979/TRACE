package org.trace.route;

final class LoginIdentity {
  private LoginIdentity() {}
  static String email(String input) {
    String value = input.trim();
    // Existing administrator email accounts remain supported.
    if (value.contains("@")) return value;
    String digits = value.replaceAll("[\\s()+-]", "");
    if (digits.length() == 12 && digits.startsWith("91")) digits = digits.substring(2);
    if (!digits.matches("[6-9][0-9]{9}")) throw new IllegalArgumentException("Enter your 10-digit mobile number, optionally starting with +91.");
    return "phone91" + digits + "@members.track.invalid";
  }
}

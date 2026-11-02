package org.trace.route;

import java.net.URI;

final class UpdatePolicy {
  static boolean isNewer(int installed, int published) { return published > installed && installed > 0; }
  static boolean validDownloadUrl(String value) {
    try {
      URI u = new URI(value);
      return "https".equals(u.getScheme()) && "raw.githubusercontent.com".equals(u.getHost())
        && u.getUserInfo() == null && u.getPort() == -1
        && u.getPath().equals("/abdulaleemarshad1979/TRACE/main/release/TRACK-Route-EastGodavari.apk")
        && u.getQuery() == null && u.getFragment() == null;
    } catch (Exception e) { return false; }
  }
}

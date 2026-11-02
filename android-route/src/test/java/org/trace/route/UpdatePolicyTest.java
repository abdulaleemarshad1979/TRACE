package org.trace.route;
import org.junit.Test;
import static org.junit.Assert.*;
public class UpdatePolicyTest {
  @Test public void onlyNewerReleasesPrompt() {
    assertFalse(UpdatePolicy.isNewer(3, 3));
    assertFalse(UpdatePolicy.isNewer(3, 2));
    assertTrue(UpdatePolicy.isNewer(3, 4));
    assertFalse(UpdatePolicy.isNewer(3, 0));
  }
  @Test public void downloadMustBeTheOfficialHttpsApk() {
    String good = "https://raw.githubusercontent.com/abdulaleemarshad1979/TRACE/main/release/TRACK-Route-EastGodavari.apk";
    assertTrue(UpdatePolicy.validDownloadUrl(good));
    assertFalse(UpdatePolicy.validDownloadUrl(good.replace("https", "http")));
    assertFalse(UpdatePolicy.validDownloadUrl(good.replace("raw.githubusercontent.com", "evil.example")));
    assertFalse(UpdatePolicy.validDownloadUrl(good + "?redirect=evil"));
  }
}

package org.trace.route;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class LoginIdentityTest {
  @Test public void indianFormatsUseTheSameAccount() {
    String expected = "phone919876543210@members.track.invalid";
    assertEquals(expected, LoginIdentity.email("9876543210"));
    assertEquals(expected, LoginIdentity.email("+91 98765 43210"));
    assertEquals(expected, LoginIdentity.email("919876543210"));
    assertEquals(expected, LoginIdentity.email("(98765)-43210"));
  }
  @Test public void adminEmailStillWorks() { assertEquals("admin@example.test", LoginIdentity.email(" admin@example.test ")); }
  @Test(expected = IllegalArgumentException.class) public void invalidPhoneIsRejected() { LoginIdentity.email("12345"); }
  @Test(expected = IllegalArgumentException.class) public void arbitraryTextIsRejected() { LoginIdentity.email("mobile9876543210"); }
}

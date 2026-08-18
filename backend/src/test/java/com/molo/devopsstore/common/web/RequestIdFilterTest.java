package com.molo.devopsstore.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

    @Test
    void propagatesAValidRequestIdAndCleansTheLoggingContext() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", "lab-request-42");
        var response = new MockHttpServletResponse();
        var filter = new RequestIdFilter();

        filter.doFilter(request, response, (incomingRequest, outgoingResponse) ->
                assertThat(MDC.get("requestId")).isEqualTo("lab-request-42"));

        assertThat(response.getHeader("X-Request-ID")).isEqualTo("lab-request-42");
        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    void replacesAnInvalidRequestId() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", "invalid id with spaces");
        var response = new MockHttpServletResponse();

        new RequestIdFilter().doFilter(request, response, (incomingRequest, outgoingResponse) -> {
        });

        assertThat(response.getHeader("X-Request-ID"))
                .matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }
}

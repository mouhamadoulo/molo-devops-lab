package com.molo.devopsstore.product.api;

import com.molo.devopsstore.identity.application.DuplicateUserEmailException;
import com.molo.devopsstore.identity.application.ForbiddenAuthRequestException;
import com.molo.devopsstore.identity.application.InvalidCredentialsException;
import com.molo.devopsstore.identity.application.InvalidSessionException;
import com.molo.devopsstore.identity.application.InvalidUserOperationException;
import com.molo.devopsstore.identity.application.InvalidUserSortException;
import com.molo.devopsstore.identity.application.UserNotFoundException;
import com.molo.devopsstore.product.application.InvalidProductSortException;
import com.molo.devopsstore.product.application.ProductNotFoundException;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(UserNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleUserNotFound(UserNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "User not found", exception.getMessage());
    }

    @ExceptionHandler(DuplicateUserEmailException.class)
    public ResponseEntity<ProblemDetail> handleDuplicateUserEmail(DuplicateUserEmailException exception) {
        return problem(HttpStatus.CONFLICT, "User email already used", exception.getMessage());
    }

    @ExceptionHandler(InvalidUserOperationException.class)
    public ResponseEntity<ProblemDetail> handleInvalidUserOperation(InvalidUserOperationException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid user operation", exception.getMessage());
    }

    @ExceptionHandler(InvalidUserSortException.class)
    public ResponseEntity<ProblemDetail> handleInvalidUserSort(InvalidUserSortException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid user sort", exception.getMessage());
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ProblemDetail> handleInvalidCredentials() {
        return problem(HttpStatus.UNAUTHORIZED, "Unauthorized", "Invalid credentials");
    }

    @ExceptionHandler(InvalidSessionException.class)
    public ResponseEntity<ProblemDetail> handleInvalidSession() {
        return problem(HttpStatus.UNAUTHORIZED, "Unauthorized", "Invalid session");
    }

    @ExceptionHandler(ForbiddenAuthRequestException.class)
    public ResponseEntity<ProblemDetail> handleForbiddenAuthRequest() {
        return problem(HttpStatus.FORBIDDEN, "Forbidden", "Authentication request is not allowed");
    }

    @ExceptionHandler(ProductNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(ProductNotFoundException exception) {
        return problem(HttpStatus.NOT_FOUND, "Product not found", exception.getMessage());
    }

    @ExceptionHandler(InvalidProductSortException.class)
    public ResponseEntity<ProblemDetail> handleInvalidSort(InvalidProductSortException exception) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid product sort", exception.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> handleValidation(MethodArgumentNotValidException exception) {
        Map<String, String> errors = new TreeMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error ->
                errors.putIfAbsent(error.getField(), error.getDefaultMessage()));

        var detail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Request validation failed");
        detail.setTitle("Validation failed");
        detail.setProperty("errors", errors);
        return ResponseEntity.badRequest()
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(detail);
    }

    private ResponseEntity<ProblemDetail> problem(HttpStatus status, String title, String message) {
        var detail = ProblemDetail.forStatusAndDetail(status, message);
        detail.setTitle(title);
        var requestId = MDC.get("requestId");
        if (requestId != null) {
            detail.setProperty("requestId", requestId);
        }
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(detail);
    }
}

package com.molo.devopsstore;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DevOpsStoreApplication {

    public static void main(String[] args) {
        SpringApplication.run(DevOpsStoreApplication.class, args);
    }
}

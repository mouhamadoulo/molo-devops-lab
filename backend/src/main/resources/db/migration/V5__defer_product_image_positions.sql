ALTER TABLE product_images
    DROP CONSTRAINT ux_product_images_product_position;

ALTER TABLE product_images
    ADD CONSTRAINT ux_product_images_product_position
    UNIQUE (product_id, position)
    DEFERRABLE INITIALLY DEFERRED;

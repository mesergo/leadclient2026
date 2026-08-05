-- Admin login seed (bcrypt). Username: admin
INSERT INTO users (username, role, display_name, password_hash, is_active, created_at)
VALUES ('admin', 'super_admin', 'System Admin', '$2a$10$Ck/7M8qATexBfwfFiBIeUuOCiMrIzk4xPqEUkNLoEirLA9yt7rSc6', 1, NOW())
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'super_admin', is_active = 1;

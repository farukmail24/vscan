<?php
/**
 * TiDB Cloud MySQL Configuration
 */
define('DB_HOST', getenv('DB_HOST') ?: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com');
define('DB_PORT', (int)(getenv('DB_PORT') ?: 4000));
define('DB_USER', getenv('DB_USER') ?: '5PNhhcR1jqyzySz.root');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: 'y8RMflfEE7BWhv5R');
define('DB_NAME', getenv('DB_NAME') ?: 'test');

function getDbConnection() {
    static $conn = null;
    if ($conn !== null) {
        return $conn;
    }

    $conn = mysqli_init();
    if (!$conn) {
        throw new Exception("mysqli_init failed");
    }

    // TiDB requires TLS/SSL
    mysqli_ssl_set($conn, NULL, NULL, NULL, NULL, NULL);

    $connected = @mysqli_real_connect(
        $conn,
        DB_HOST,
        DB_USER,
        DB_PASSWORD,
        DB_NAME,
        DB_PORT,
        NULL,
        MYSQLI_CLIENT_SSL
    );

    if (!$connected) {
        throw new Exception("TiDB Database connection failed: " . mysqli_connect_error());
    }

    mysqli_set_charset($conn, "utf8mb4");
    return $conn;
}

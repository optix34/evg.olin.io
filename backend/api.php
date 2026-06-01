<?php
/**
 * API для синхронизации настроек датчиков
 * Хранилище: SQLite
 * Эндпоинты:
 *   GET  api.php?action=get&user_id=XXX  - получить все настройки пользователя
 *   POST api.php?action=set               - сохранить настройки для одного ТС
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Конфигурация
define('DB_FILE', __DIR__ . '/settings.db');

// Инициализация БД
function initDB() {
    $db = new SQLite3(DB_FILE);
    $db->exec("CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        vehid INTEGER NOT NULL,
        settings TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, vehid)
    )");
    $db->close();
}

// Получить данные пользователя
function getSettings($userId) {
    $db = new SQLite3(DB_FILE);
    $stmt = $db->prepare("SELECT vehid, settings FROM user_settings WHERE user_id = :user_id");
    $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
    $result = $stmt->execute();
    $settings = [];
    while ($row = $result->fetchArray(SQLITE3_ASSOC)) {
        $settings[$row['vehid']] = json_decode($row['settings'], true);
    }
    $db->close();
    return $settings;
}

// Сохранить настройки для одного ТС
function setSettings($userId, $vehid, $settings) {
    $db = new SQLite3(DB_FILE);
    $settingsJson = json_encode($settings);
    $stmt = $db->prepare("INSERT OR REPLACE INTO user_settings (user_id, vehid, settings, updated_at) 
                          VALUES (:user_id, :vehid, :settings, :updated_at)");
    $stmt->bindValue(':user_id', $userId, SQLITE3_INTEGER);
    $stmt->bindValue(':vehid', $vehid, SQLITE3_INTEGER);
    $stmt->bindValue(':settings', $settingsJson, SQLITE3_TEXT);
    $stmt->bindValue(':updated_at', time(), SQLITE3_INTEGER);
    $result = $stmt->execute();
    $db->close();
    return $result !== false;
}

// Определяем ID пользователя (берём из сессии PILOT, если нет – fallback)
function getCurrentUserId() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    if (isset($_SESSION['user_id'])) {
        return (int)$_SESSION['user_id'];
    }
    if (isset($_SERVER['HTTP_X_USER_ID'])) {
        return (int)$_SERVER['HTTP_X_USER_ID'];
    }
    // fallback: на основе IP и User Agent
    return (int)(crc32($_SERVER['REMOTE_ADDR'] . $_SERVER['HTTP_USER_AGENT']));
}

initDB();

$action = isset($_GET['action']) ? $_GET['action'] : '';
$userId = getCurrentUserId();

if ($action === 'get') {
    $data = getSettings($userId);
    echo json_encode(['success' => true, 'data' => $data]);
} elseif ($action === 'set') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['vehid']) || !isset($input['settings'])) {
        echo json_encode(['success' => false, 'error' => 'Missing vehid or settings']);
        exit;
    }
    $vehid = (int)$input['vehid'];
    $settings = $input['settings'];
    $ok = setSettings($userId, $vehid, $settings);
    echo json_encode(['success' => $ok]);
} else {
    echo json_encode(['success' => false, 'error' => 'Unknown action']);
}

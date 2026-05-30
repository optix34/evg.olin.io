<?php
// CORS-прокси для Sensor Events Analyzer
// Разместите этот файл в папке backend/ вашего расширения
// URL в настройках расширения: /store/sensor_events_analyzer/backend/proxy.php?vehid=

// Разрешаем запросы с любого origin (для тестов) или укажите конкретный
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Обработка предварительных OPTIONS-запросов
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// === НАСТРОЙКИ ===
// Адрес реального API (без параметров)
$targetBaseUrl = 'https://example.com/api/events';
// Если API требует ключ, укажите его здесь или храните в localStorage расширения (но ключ будет виден в коде)
$apiKey = ''; // опционально

// Получаем параметр vehid из запроса к прокси
$vehid = isset($_GET['vehid']) ? $_GET['vehid'] : '';

if (empty($vehid)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing vehid parameter']);
    exit();
}

// Формируем целевой URL
$targetUrl = $targetBaseUrl . '?vehid=' . urlencode($vehid);

// Добавляем API-ключ, если требуется
if (!empty($apiKey)) {
    $targetUrl .= '&apiKey=' . urlencode($apiKey);
}

// Выполняем запрос к внешнему API
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $targetUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Возвращаем ответ с тем же кодом и заголовком Content-Type
http_response_code($httpCode);
header('Content-Type: application/json; charset=utf-8');
echo $response;

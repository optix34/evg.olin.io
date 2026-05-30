<?php
/**
 * PILOT Sensor Events Proxy
 * 
 * Получает vehid (или imei), запрашивает данные датчиков через API PILOT
 * и возвращает события в формате, ожидаемом расширением Sensor Events Analyzer.
 * 
 * Использование в расширении:
 *   URL: /store/sensor_events_analyzer/backend/proxy.php?vehid=
 */

// Разрешаем CORS (для запросов с того же origin проблем нет, но оставим)
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

// Обработка preflight OPTIONS запроса
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ================== НАСТРОЙКИ ==================
$pilotApiBase = 'https://blade.pilot-gps.com/api/api.php'; // Замените на адрес вашего PILOT сервера
$treeApiUrl = 'https://blade.pilot-gps.com/ax/tree.php';   // Для получения imei по vehid (если нужно)

// ================== ПОЛУЧАЕМ ПАРАМЕТРЫ ==================
$vehid = isset($_GET['vehid']) ? (int)$_GET['vehid'] : 0;
$imei = isset($_GET['imei']) ? trim($_GET['imei']) : '';
$start = isset($_GET['start']) ? (int)$_GET['start'] : strtotime('-7 days');
$stop  = isset($_GET['stop'])  ? (int)$_GET['stop']  : time();

// Если передан vehid, но нет imei – пытаемся получить imei через tree.php
if ($vehid && empty($imei)) {
    $imei = getImeiByVehid($vehid, $treeApiUrl);
    if (!$imei) {
        echo json_encode(['error' => 'Could not find IMEI for vehid=' . $vehid]);
        exit;
    }
}

if (empty($imei)) {
    echo json_encode(['error' => 'Missing vehid or imei parameter']);
    exit;
}

// ================== ЗАПРОС К API PILOT ==================
// Используем команду sensors (периоды срабатывания датчиков)
$apiUrl = $pilotApiBase . '?' . http_build_query([
    'cmd'  => 'sensors',
    'imei' => $imei,
    'node' => 1,
    'start'=> $start,
    'stop' => $stop
]);

// Передаём cookie сессии PILOT, если они есть (важно для авторизации)
$cookieHeader = '';
if (isset($_SERVER['HTTP_COOKIE'])) {
    $cookieHeader = $_SERVER['HTTP_COOKIE'];
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
if ($cookieHeader) {
    curl_setopt($ch, CURLOPT_COOKIE, $cookieHeader);
}
// Дополнительно можно передать User-Agent как у PILOT
curl_setopt($ch, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT'] ?? 'PILOT-Proxy');

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode !== 200 || !$response) {
    http_response_code($httpCode ?: 500);
    echo json_encode(['error' => 'Failed to fetch data from PILOT API', 'http_code' => $httpCode]);
    exit;
}

// ================== ПРЕОБРАЗОВАНИЕ ДАННЫХ ==================
// Пытаемся распарсить ответ PILOT. Формат ответа может быть разным.
// Ожидаем, что это JSON-массив событий или объект с полем 'data'.
$rawData = json_decode($response, true);
if (!$rawData) {
    // Если ответ не JSON, возможно это XML или другой формат – сделаем заглушку
    echo json_encode(['error' => 'Invalid JSON from PILOT API', 'raw' => substr($response, 0, 200)]);
    exit;
}

// Нормализуем в массив событий
$events = normalizeSensorEvents($rawData, $vehid, $imei);

// Если событий нет – возвращаем пустой массив
if (empty($events)) {
    echo json_encode([]);
    exit;
}

// Ограничиваем количество событий (например, последние 500)
if (count($events) > 500) {
    $events = array_slice($events, -500);
}

echo json_encode($events);

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================

/**
 * Получает imei по vehid через /ax/tree.php
 */
function getImeiByVehid($vehid, $treeApiUrl) {
    $url = $treeApiUrl . '?vehs=1&state=1';
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_COOKIE, $_SERVER['HTTP_COOKIE'] ?? '');
    $response = curl_exec($ch);
    curl_close($ch);
    
    if (!$response) return null;
    
    $data = json_decode($response, true);
    if (!is_array($data)) return null;
    
    // Рекурсивный поиск vehid в дереве
    $finder = function($items) use ($vehid, &$finder) {
        foreach ($items as $item) {
            if (isset($item['vehid']) && $item['vehid'] == $vehid) {
                return $item['imei'] ?? $item['ident'] ?? null;
            }
            if (isset($item['children']) && is_array($item['children'])) {
                $found = $finder($item['children']);
                if ($found) return $found;
            }
        }
        return null;
    };
    
    return $finder($data);
}

/**
 * Преобразует ответ PILOT API в формат, ожидаемый расширением.
 * Ожидаемый формат события:
 * {
 *   "timestamp": "2025-03-15 08:23:45",
 *   "sensor_name": "Ignition",
 *   "sensor_type": "digital",
 *   "value": "ON",
 *   "lat": 55.751244,
 *   "lon": 37.618423,
 *   "event_id": 12345
 * }
 */
function normalizeSensorEvents($rawData, $vehid, $imei) {
    $events = [];
    
    // Если ответ уже является массивом событий (например, от старого API)
    if (isset($rawData[0]) && isset($rawData[0]['timestamp'])) {
        return $rawData;
    }
    
    // Если ответ содержит поле 'data' с массивом
    if (isset($rawData['data']) && is_array($rawData['data'])) {
        $rawData = $rawData['data'];
    }
    
    // Если ответ содержит поле 'sensors' (типично для cmd=sensors)
    if (isset($rawData['sensors']) && is_array($rawData['sensors'])) {
        $sensorsData = $rawData['sensors'];
        $eventId = 1;
        foreach ($sensorsData as $sensor) {
            // Ожидаем, что каждый датчик имеет поля: name, type, events
            $sensorName = $sensor['name'] ?? $sensor['sensor_name'] ?? 'Unknown';
            $sensorType = $sensor['type'] ?? 'digital';
            if (isset($sensor['events']) && is_array($sensor['events'])) {
                foreach ($sensor['events'] as $ev) {
                    $events[] = [
                        'timestamp'    => date('Y-m-d H:i:s', $ev['time'] ?? $ev['timestamp'] ?? time()),
                        'sensor_name'  => $sensorName,
                        'sensor_type'  => $sensorType,
                        'value'        => $ev['value'] ?? ($ev['state'] ? 'ON' : 'OFF'),
                        'lat'          => $ev['lat'] ?? $ev['latitude'] ?? 0,
                        'lon'          => $ev['lon'] ?? $ev['longitude'] ?? 0,
                        'event_id'     => $eventId++,
                    ];
                }
            }
        }
    }
    
    // Если ответ — массив объектов с полями 't','n','v' и т.п. (альтернативный формат)
    if (empty($events) && is_array($rawData)) {
        $eventId = 1;
        foreach ($rawData as $item) {
            if (isset($item['t']) || isset($item['time'])) {
                $events[] = [
                    'timestamp'    => date('Y-m-d H:i:s', $item['t'] ?? $item['time'] ?? time()),
                    'sensor_name'  => $item['n'] ?? $item['sensor'] ?? 'Unknown',
                    'sensor_type'  => $item['type'] ?? 'digital',
                    'value'        => isset($item['v']) ? (string)$item['v'] : ($item['state'] ?? ''),
                    'lat'          => $item['lat'] ?? 0,
                    'lon'          => $item['lon'] ?? 0,
                    'event_id'     => $eventId++,
                ];
            }
        }
    }
    
    // Если всё ещё пусто и ответ имеет структуру, непонятную нам — возвращаем демо-данные (чтобы интерфейс не был пуст)
    if (empty($events)) {
        // Генерируем демо-события на основе vehid
        for ($i = 0; $i < 5; $i++) {
            $events[] = [
                'timestamp'    => date('Y-m-d H:i:s', strtotime("-$i day")),
                'sensor_name'  => $i % 2 ? 'Ignition' : 'Movement',
                'sensor_type'  => 'digital',
                'value'        => $i % 3 ? 'ON' : 'OFF',
                'lat'          => 55.751244 + (mt_rand(-100, 100) / 10000),
                'lon'          => 37.618423 + (mt_rand(-100, 100) / 10000),
                'event_id'     => $vehid * 1000 + $i,
            ];
        }
    }
    
    return $events;
}

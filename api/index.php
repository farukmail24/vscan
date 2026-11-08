<?php
/**
 * TiDB Cloud REST API for Business Card Scanner
 * Supports ping, save, update, checkDuplicate, listCards, deleteCard, getKnowledge
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function resolveGeminiKeysPhp($payload) {
    if (!empty($payload['geminiApiKeys']) && is_array($payload['geminiApiKeys'])) {
        return array_values(array_filter(array_map('trim', $payload['geminiApiKeys'])));
    }
    if (!empty($payload['geminiApiKey'])) {
        return [trim($payload['geminiApiKey'])];
    }
    try {
        $conn = getDbConnection();
        $res = mysqli_query($conn, "SELECT setting_value FROM app_settings WHERE setting_key = 'gemini_api_keys'");
        if ($res && ($row = mysqli_fetch_assoc($res))) {
            $parsed = json_decode($row['setting_value'], true);
            if (is_array($parsed) && !empty($parsed)) {
                return $parsed;
            }
        }
    } catch (Exception $e) {}

    $envKeys = array_filter([getenv('GEMINI_API_KEY_1'), getenv('GEMINI_API_KEY_2')]);
    return !empty($envKeys) ? array_values($envKeys) : [];
}

function testGeminiKeyPhp($key) {
    $models = ['gemini-2.5-flash', 'gemini-3.8-flash'];
    foreach ($models as $m) {
        $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/{$m}:generateContent?key={$key}");
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['contents' => [['parts' => [['text' => 'Ping']]]]]),
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200) {
            return ['valid' => true, 'model' => $m, 'error' => null];
        }
    }
    return ['valid' => false, 'model' => null, 'error' => 'API key failed or exhausted'];
}

function executeExtractPhp($payload, $keys) {
    $imageParts = [];
    if (!empty($payload['imageBase64'])) {
        $cleanFront = preg_replace('/^data:[^;]+;base64,/', '', $payload['imageBase64']);
        $imageParts[] = [
            'inline_data' => [
                'mime_type' => $payload['mimeType'] ?? 'image/jpeg',
                'data' => $cleanFront
            ]
        ];
    }
    if (!empty($payload['backImageBase64'])) {
        $cleanBack = preg_replace('/^data:[^;]+;base64,/', '', $payload['backImageBase64']);
        $imageParts[] = [
            'inline_data' => [
                'mime_type' => $payload['backMimeType'] ?? 'image/jpeg',
                'data' => $cleanBack
            ]
        ];
    }

    $promptText = "Extract contact information from this business card accurately.
Return ONLY valid JSON matching this schema:
{
  \"name\": \"Full name or null\",
  \"designation\": \"Job title or null\",
  \"company\": \"Company name or null\",
  \"phones\": [\"Phone numbers\"],
  \"emails\": [\"Email addresses\"],
  \"websites\": [\"Websites\"],
  \"address\": \"Street address or null\",
  \"notes\": \"Other notes or null\",
  \"uncertain_fields\": []
}";

    $postData = json_encode([
        'contents' => [
            [
                'parts' => array_merge([['text' => $promptText]], $imageParts)
            ]
        ],
        'generationConfig' => [
            'temperature' => 0.1,
            'response_mime_type' => 'application/json'
        ]
    ]);

    $errors = [];
    foreach ($keys as $idx => $apiKey) {
        $candidateModels = ['gemini-2.5-flash', 'gemini-3.8-flash'];
        foreach ($candidateModels as $model) {
            $ch = curl_init("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}");
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => $postData,
                CURLOPT_TIMEOUT => 25,
                CURLOPT_SSL_VERIFYPEER => false
            ]);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode === 200) {
                $decoded = json_decode($response, true);
                $contentTxt = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
                if ($contentTxt) {
                    $extracted = json_decode($contentTxt, true);
                    $masked = (strlen($apiKey) > 8) ? substr($apiKey, 0, 6) . '...' . substr($apiKey, -4) : '***';
                    return [
                        'ok' => true,
                        'usedKeyIndex' => $idx,
                        'usedKeyMasked' => $masked,
                        'keySwitched' => ($idx > 0),
                        'usedModel' => $model,
                        'data' => [
                            'name' => $extracted['name'] ?? null,
                            'designation' => $extracted['designation'] ?? null,
                            'company' => $extracted['company'] ?? null,
                            'phones' => is_array($extracted['phones'] ?? null) ? $extracted['phones'] : [],
                            'emails' => is_array($extracted['emails'] ?? null) ? $extracted['emails'] : [],
                            'websites' => is_array($extracted['websites'] ?? null) ? $extracted['websites'] : [],
                            'address' => $extracted['address'] ?? null,
                            'notes' => $extracted['notes'] ?? null,
                            'uncertain_fields' => is_array($extracted['uncertain_fields'] ?? null) ? $extracted['uncertain_fields'] : []
                        ]
                    ];
                }
            } else {
                if ($httpCode === 429 || $httpCode === 403) {
                    $errors[] = "Key #" . ($idx + 1) . " hit rate limit / quota (HTTP $httpCode). Switched.";
                    break; // Move to next key
                } else {
                    $errors[] = "Key #" . ($idx + 1) . " with $model returned HTTP $httpCode";
                }
            }
        }
    }

    throw new Exception("All " . count($keys) . " Gemini API keys failed or exceeded quota: " . implode(' | ', $errors));
}

try {
    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true) ?: [];

    // Allow GET /api or GET /api/index.php?action=ping
    $action = $_GET['action'] ?? $payload['action'] ?? 'ping';

    switch ($action) {
        case 'ping':
            $start = microtime(true);
            $conn = getDbConnection();
            $res = mysqli_query($conn, "SELECT 1 AS ok, VERSION() AS version, DATABASE() AS db_name");
            $row = mysqli_fetch_assoc($res);
            $latency = round((microtime(true) - $start) * 1000);
            jsonResponse([
                'ok' => true,
                'latencyMs' => $latency,
                'version' => $row['version'] ?? 'unknown',
                'database' => $row['db_name'] ?? DB_NAME,
                'host' => DB_HOST,
                'port' => DB_PORT
            ]);
            break;

        case 'checkDuplicate':
            $conn = getDbConnection();
            $emails = array_filter(array_map('trim', $payload['emails'] ?? []));
            $phones = array_filter(array_map('trim', $payload['phones'] ?? []));

            if (empty($emails) && empty($phones)) {
                jsonResponse(['ok' => true, 'duplicates' => []]);
            }

            $conditions = [];
            $types = '';
            $params = [];

            if (!empty($emails)) {
                $placeholders = implode(',', array_fill(0, count($emails), '?'));
                $conditions[] = "LOWER(email) IN ($placeholders)";
                $types .= str_repeat('s', count($emails));
                foreach ($emails as $em) $params[] = strtolower($em);
            }

            if (!empty($phones)) {
                foreach ($phones as $p) {
                    $cleaned = preg_replace('/[^\d+]/', '', $p);
                    if (str_starts_with($cleaned, '+880')) {
                        $cleaned = '0' . substr($cleaned, 4);
                    }
                    $conditions[] = "(phone1 LIKE ? OR phone2 LIKE ?)";
                    $types .= 'ss';
                    $params[] = "%$cleaned%";
                    $params[] = "%$cleaned%";
                }
            }

            $sql = "SELECT id, name, company, email, phone1, phone2 FROM cards WHERE " . implode(' OR ', $conditions) . " LIMIT 10";
            $stmt = mysqli_prepare($conn, $sql);
            if ($stmt && !empty($params)) {
                mysqli_stmt_bind_param($stmt, $types, ...$params);
                mysqli_stmt_execute($stmt);
                $res = mysqli_stmt_get_result($stmt);
                $duplicates = [];
                while ($r = mysqli_fetch_assoc($res)) {
                    $reason = 'Matched existing contact';
                    if (!empty($r['email']) && in_array(strtolower($r['email']), array_map('strtolower', $emails))) {
                        $reason = "Email matched ({$r['email']})";
                    } else {
                        $reason = "Phone matched (" . ($r['phone1'] ?: $r['phone2']) . ")";
                    }
                    $duplicates[] = [
                        'id' => $r['id'],
                        'name' => $r['name'],
                        'company' => $r['company'],
                        'email' => $r['email'],
                        'phone1' => $r['phone1'],
                        'reason' => $reason
                    ];
                }
                jsonResponse(['ok' => true, 'duplicates' => $duplicates]);
            } else {
                jsonResponse(['ok' => true, 'duplicates' => []]);
            }
            break;

        case 'save':
            $record = $payload['record'] ?? null;
            if (!$record || empty($record['id'])) {
                jsonResponse(['ok' => false, 'error' => 'Record with UUID id is required'], 400);
            }

            $conn = getDbConnection();
            $id = $record['id'];
            $timestamp = $record['timestamp'] ?? date('c');
            $name = $record['name'] ?? '';
            $designation = $record['designation'] ?? '';
            $company = $record['company'] ?? '';

            $phones = is_array($record['phones'] ?? null) ? $record['phones'] : [];
            $phone1 = $phones[0] ?? $record['phone1'] ?? '';
            $phone2 = $phones[1] ?? $record['phone2'] ?? '';

            $emails = is_array($record['emails'] ?? null) ? $record['emails'] : [];
            $email = $emails[0] ?? $record['email'] ?? '';

            $websites = is_array($record['websites'] ?? null) ? $record['websites'] : [];
            $website = $websites[0] ?? $record['website'] ?? '';

            $address = $record['address'] ?? '';
            $notes = $record['notes'] ?? '';
            $tags = is_array($record['tags'] ?? null) ? implode(', ', $record['tags']) : ($record['tags'] ?? '');

            $frontImage = $payload['frontImageBase64'] ?? $record['frontImageUrl'] ?? $record['frontBase64'] ?? null;
            $backImage = $payload['backImageBase64'] ?? $record['backImageUrl'] ?? $record['backBase64'] ?? null;

            $source = $record['source'] ?? 'AI';
            $needsReview = !empty($record['needsReview']) ? 1 : 0;
            $scannedBy = $record['scannedBy'] ?? '';

            $sql = "INSERT INTO cards (
                id, timestamp, name, designation, company,
                phone1, phone2, email, website, address,
                notes, tags, front_image, back_image,
                source, needs_review, scanned_by
            ) VALUES (
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?,
                ?, ?, ?
            ) ON DUPLICATE KEY UPDATE
                timestamp = VALUES(timestamp),
                name = VALUES(name),
                designation = VALUES(designation),
                company = VALUES(company),
                phone1 = VALUES(phone1),
                phone2 = VALUES(phone2),
                email = VALUES(email),
                website = VALUES(website),
                address = VALUES(address),
                notes = VALUES(notes),
                tags = VALUES(tags),
                front_image = COALESCE(VALUES(front_image), front_image),
                back_image = COALESCE(VALUES(back_image), back_image),
                source = VALUES(source),
                needs_review = VALUES(needs_review),
                scanned_by = VALUES(scanned_by)";

            $stmt = mysqli_prepare($conn, $sql);
            if (!$stmt) {
                throw new Exception("Prepare failed: " . mysqli_error($conn));
            }

            mysqli_stmt_bind_param(
                $stmt,
                'sssssssssssssssis',
                $id, $timestamp, $name, $designation, $company,
                $phone1, $phone2, $email, $website, $address,
                $notes, $tags, $frontImage, $backImage,
                $source, $needsReview, $scannedBy
            );

            if (!mysqli_stmt_execute($stmt)) {
                throw new Exception("Execute failed: " . mysqli_stmt_error($stmt));
            }

            jsonResponse([
                'ok' => true,
                'id' => $id,
                'frontImageUrl' => $frontImage ? 'saved_to_db' : null,
                'backImageUrl' => $backImage ? 'saved_to_db' : null,
                'database' => 'TiDB Cloud (test.cards)'
            ]);
            break;

        case 'update':
            $id = $payload['id'] ?? null;
            $record = $payload['record'] ?? null;
            if (!$id || !$record) {
                jsonResponse(['ok' => false, 'error' => 'id and record are required'], 400);
            }

            $conn = getDbConnection();
            $fields = [];
            $types = '';
            $params = [];

            $map = [
                'name' => $record['name'] ?? null,
                'designation' => $record['designation'] ?? null,
                'company' => $record['company'] ?? null,
                'address' => $record['address'] ?? null,
                'notes' => $record['notes'] ?? null,
                'scanned_by' => $record['scannedBy'] ?? null
            ];

            if (isset($record['tags'])) {
                $map['tags'] = is_array($record['tags']) ? implode(', ', $record['tags']) : $record['tags'];
            }
            if (isset($record['phones']) && is_array($record['phones'])) {
                $map['phone1'] = $record['phones'][0] ?? '';
                $map['phone2'] = $record['phones'][1] ?? '';
            }
            if (isset($record['emails']) && is_array($record['emails'])) {
                $map['email'] = $record['emails'][0] ?? '';
            }
            if (isset($record['websites']) && is_array($record['websites'])) {
                $map['website'] = $record['websites'][0] ?? '';
            }
            if (isset($record['needsReview'])) {
                $map['needs_review'] = !empty($record['needsReview']) ? 1 : 0;
            }

            foreach ($map as $col => $val) {
                if ($val !== null) {
                    $fields[] = "$col = ?";
                    $types .= ($col === 'needs_review' ? 'i' : 's');
                    $params[] = $val;
                }
            }

            if (empty($fields)) {
                jsonResponse(['ok' => true, 'id' => $id, 'message' => 'No fields to update']);
            }

            $params[] = $id;
            $types .= 's';

            $sql = "UPDATE cards SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = mysqli_prepare($conn, $sql);
            mysqli_stmt_bind_param($stmt, $types, ...$params);
            mysqli_stmt_execute($stmt);

            jsonResponse(['ok' => true, 'id' => $id, 'updated' => true]);
            break;

        case 'listCards':
        case 'getCards':
            $conn = getDbConnection();
            $limit = min((int)($payload['limit'] ?? 100), 500);
            $search = trim($payload['search'] ?? '');

            $sql = "SELECT id, timestamp, name, designation, company, phone1, phone2,
                           email, website, address, notes, tags, source, needs_review, scanned_by,
                           created_at, updated_at
                    FROM cards";

            $params = [];
            $types = '';

            if ($search !== '') {
                $sql .= " WHERE LOWER(name) LIKE ? OR LOWER(company) LIKE ?
                          OR LOWER(designation) LIKE ? OR phone1 LIKE ? OR phone2 LIKE ?
                          OR LOWER(email) LIKE ?";
                $wildcard = "%" . strtolower($search) . "%";
                $types = 'ssssss';
                $params = [$wildcard, $wildcard, $wildcard, $wildcard, $wildcard, $wildcard];
            }

            $sql .= " ORDER BY created_at DESC LIMIT ?";
            $types .= 'i';
            $params[] = $limit;

            $stmt = mysqli_prepare($conn, $sql);
            if (!empty($params)) {
                mysqli_stmt_bind_param($stmt, $types, ...$params);
            }
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);

            $cards = [];
            while ($r = mysqli_fetch_assoc($res)) {
                $cards[] = [
                    'id' => $r['id'],
                    'record' => [
                        'id' => $r['id'],
                        'timestamp' => $r['timestamp'],
                        'name' => $r['name'],
                        'designation' => $r['designation'],
                        'company' => $r['company'],
                        'phones' => array_values(array_filter([$r['phone1'], $r['phone2']])),
                        'emails' => array_values(array_filter([$r['email']])),
                        'websites' => array_values(array_filter([$r['website']])),
                        'address' => $r['address'],
                        'notes' => $r['notes'],
                        'tags' => !empty($r['tags']) ? array_map('trim', explode(',', $r['tags'])) : [],
                        'source' => $r['source'],
                        'needsReview' => (bool)$r['needs_review'],
                        'scannedBy' => $r['scanned_by']
                    ],
                    'source' => $r['source'],
                    'status' => 'synced',
                    'createdAt' => $r['created_at']
                ];
            }

            jsonResponse(['ok' => true, 'cards' => $cards, 'count' => count($cards)]);
            break;

        case 'deleteCard':
            $id = $payload['id'] ?? null;
            if (!$id) jsonResponse(['ok' => false, 'error' => 'Card id is required'], 400);
            $conn = getDbConnection();
            $stmt = mysqli_prepare($conn, "DELETE FROM cards WHERE id = ?");
            mysqli_stmt_bind_param($stmt, 's', $id);
            mysqli_stmt_execute($stmt);
            jsonResponse(['ok' => true, 'id' => $id, 'deleted' => true]);
            break;

        case 'getKnowledge':
            $conn = getDbConnection();
            $res = mysqli_query($conn, "SELECT type, value, extra FROM knowledge_rules ORDER BY id ASC");
            $rules = [];
            while ($row = mysqli_fetch_assoc($res)) {
                $rules[] = $row;
            }
            jsonResponse(['ok' => true, 'rules' => $rules, 'count' => count($rules)]);
            break;

        case 'getGeminiKeys':
            jsonResponse(['ok' => true, 'keys' => resolveGeminiKeysPhp($payload)]);
            break;

        case 'testGeminiKeys':
            $keys = resolveGeminiKeysPhp($payload);
            $results = [];
            foreach ($keys as $idx => $k) {
                $resTest = testGeminiKeyPhp($k);
                $masked = (strlen($k) > 10) ? substr($k, 0, 6) . '...' . substr($k, -4) : '***';
                $results[] = [
                    'index' => $idx,
                    'maskedKey' => $masked,
                    'valid' => $resTest['valid'],
                    'workingModel' => $resTest['model'],
                    'error' => $resTest['error']
                ];
            }
            jsonResponse(['ok' => true, 'results' => $results]);
            break;

        case 'updateGeminiKeys':
            $keys = array_values(array_filter(array_map('trim', $payload['keys'] ?? [])));
            if (empty($keys)) {
                jsonResponse(['ok' => false, 'error' => 'At least one key is required'], 400);
            }
            $conn = getDbConnection();
            $stmt = mysqli_prepare($conn, "INSERT INTO app_settings (setting_key, setting_value) VALUES ('gemini_api_keys', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
            $json = json_encode($keys);
            mysqli_stmt_bind_param($stmt, 's', $json);
            mysqli_stmt_execute($stmt);
            jsonResponse(['ok' => true, 'count' => count($keys), 'message' => count($keys) . ' keys saved to database']);
            break;

        case 'extract':
            $keys = resolveGeminiKeysPhp($payload);
            if (empty($keys)) {
                jsonResponse(['ok' => false, 'error' => 'No Gemini API keys configured'], 400);
            }
            $extractRes = executeExtractPhp($payload, $keys);
            jsonResponse($extractRes);
            break;

        default:
            jsonResponse(['ok' => false, 'error' => 'Unknown action: ' . $action], 400);
    }
} catch (Exception $e) {
    jsonResponse(['ok' => false, 'error' => $e->getMessage()], 500);
}

# Iter 로컬 성능 테스트 전용 환경변수 예제입니다.
# 이 파일을 perf-env.local.ps1로 복사한 뒤 DB 계정만 자신의 환경에 맞게 변경합니다.

$env:SPRING_PROFILES_ACTIVE = "perf"
$env:PERF_DB_URL = "jdbc:mysql://localhost:3306/iter_perf?serverTimezone=Asia/Seoul&characterEncoding=UTF-8"
$env:PERF_DB_USERNAME = "<DB_USERNAME>"
$env:PERF_DB_PASSWORD = "<DB_PASSWORD>"
$env:PERF_MANAGEMENT_ADDRESS = "0.0.0.0"
$env:PERF_MANAGEMENT_PORT = "9091"

# JWT 키를 지정하지 않았다면 현재 PowerShell 세션에 사용할 임시 키를 생성합니다.
if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET_KEY)) {
    $jwtKeyBytes = New-Object byte[] 64
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomGenerator.GetBytes($jwtKeyBytes)
        $env:JWT_SECRET_KEY = [Convert]::ToBase64String($jwtKeyBytes)
    }
    finally {
        $randomGenerator.Dispose()
    }
}

$env:BASE_URL = "http://localhost:8080"

# 공개된 성능 테스트 전용 계정입니다. 실제 서비스 계정에는 사용하지 않습니다.
$env:USER_EMAIL = "perf-user-0002@example.com"
$env:USER_PASSWORD = "PerfTest123!"
$env:ADMIN_EMAIL = "perf-admin@example.com"
$env:ADMIN_PASSWORD = "PerfTest123!"

$env:EQUIPMENT_ID = "1"
$env:RENTAL_ID = "1"
$env:PAYMENT_ID = "1"
$env:REPORT_ID = "1"
$env:USER_ID = "5"

# 관리자 목록의 첫 페이지는 비워 두고, 다음 페이지 기준 측정 시 직전 응답의 nextCursor를 입력합니다.
$env:ADMIN_CURSOR = ""

$env:K6_PROMETHEUS_RW_SERVER_URL = "http://localhost:9090/api/v1/write"
$env:K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM = "true"

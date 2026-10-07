// O controle de uma mão do shōbu em cardboard.
//
// O ESP32 se anuncia como gamepad BLE HID genérico. O Android traduz cada
// botão HID num KEYCODE_BUTTON_*, e o Chrome entrega isso na Gamepad API com
// mapping "standard" — o jogo não precisa de driver nem de app. A tabela de
// botões abaixo **é o contrato** com o cliente (README.md, "Contrato"); mudar
// um número aqui sem mudar lá deixa um botão do jogo mudo.

#include <Arduino.h>
#include <BleGamepad.h>

// ---------------------------------------------------------------- pinos

// ADC1 e não ADC2: o ADC2 é do driver do rádio, e com o bluetooth ligado a
// leitura dele falha ou volta lixo. 34 e 35 são só-entrada, sem pull interno,
// o que é exatamente o que um potenciômetro quer.
constexpr uint8_t PIN_STICK_X = 34;
constexpr uint8_t PIN_STICK_Y = 35;

// Botões entre o pino e o GND, com o pull-up interno: sem resistor na placa.
// Fora dos pinos de strapping (0, 2, 12, 15): um botão preso no boot mudaria
// o modo de inicialização do chip, e na feira isso parece controle quebrado.
constexpr uint8_t PIN_STICK_CLICK = 25;
constexpr uint8_t PIN_FIRE = 32;
constexpr uint8_t PIN_SCOPE = 33;
constexpr uint8_t PIN_JUMP = 26;
constexpr uint8_t PIN_RELOAD = 27;
constexpr uint8_t PIN_CROUCH = 14;
constexpr uint8_t PIN_RECENTER = 13;

// A tensão das pilhas, por um divisor de 100k (em cima) e 68k (embaixo) ligado
// no VIN depois da chave. 36 é ADC1 e só-entrada: o mesmo motivo do analógico.
constexpr uint8_t PIN_BATTERY = 36;

// ---------------------------------------------------------------- contrato

struct ButtonBinding {
  uint8_t pin;
  uint8_t hidButton;  // 1-based, como a ESP32-BLE-Gamepad numera
};

// HID n → BTN_GAMEPAD + (n-1) no kernel → KEYCODE_BUTTON_* no Android → o
// índice "standard" que o jogo lê. L2/R2 (9 e 10) ficam de fora de propósito:
// o Chrome Android pode tratá-los como eixo de gatilho, e o tiro não pode
// depender de como cada versão do Chrome decide isso.
constexpr ButtonBinding BUTTONS[] = {
    {PIN_JUMP, BUTTON_1},          // A      → standard 0
    {PIN_CROUCH, BUTTON_2},        // B      → standard 1
    {PIN_RELOAD, BUTTON_4},        // X      → standard 2
    {PIN_SCOPE, BUTTON_7},         // L1     → standard 4
    {PIN_FIRE, BUTTON_8},          // R1     → standard 5
    {PIN_RECENTER, BUTTON_12},     // START  → standard 9
    {PIN_STICK_CLICK, BUTTON_14},  // THUMBL → standard 10
};
constexpr size_t BUTTON_COUNT = sizeof(BUTTONS) / sizeof(BUTTONS[0]);

// ---------------------------------------------------------------- analógico

// O KY-023 é alimentado em 3V3, não em 5 V: o ADC do ESP32 satura em ~3,1 V,
// e com 5 V meio curso do potenciômetro viraria um platô no fim da faixa.
constexpr int ADC_MAX = 4095;

// Média no boot: o centro mecânico do KY-023 cai entre ~1700 e ~2000, longe
// de 2048, e varia de peça para peça. **Não mexer no analógico ao ligar.**
constexpr int CALIBRATION_SAMPLES = 64;

// Em contagens do ADC. O KY-023 é barato e o centro dele treme ~±60; sem zona
// morta o personagem anda sozinho com o controle parado na mesa.
constexpr int DEAD_ZONE = 180;

// Convenção standard: x positivo é direita, y positivo é para baixo (trás).
// Trocar aqui se o módulo ficar girado na carcaça, em vez de trocar fios.
constexpr bool INVERT_X = false;
constexpr bool INVERT_Y = false;

// A faixa da biblioteca (0..32767), com o centro no meio.
constexpr int16_t AXIS_MIN = 0;
constexpr int16_t AXIS_MAX = 32767;
constexpr int16_t AXIS_CENTER = 16384;

// ---------------------------------------------------------------- bateria

// 4 AAA em série no VIN. O divisor leva os 6,4 V de 4 alcalinas novas a 2,6 V,
// abaixo do teto de ~3,1 V do ADC com 11 dB.
constexpr float BATTERY_DIVIDER = (100.0f + 68.0f) / 68.0f;
// NiMH: 4 × 1,30 V cheias, 4 × 1,10 V vazias. Abaixo de ~4,4 V o regulador do
// DevKit (AMS1117) sai de regulação, e é por isso que esse é o zero, não o
// fim químico das pilhas. Alcalina nova passa de 5,2 V e marca 100%.
constexpr int BATTERY_EMPTY_MV = 4400;
constexpr int BATTERY_FULL_MV = 5200;
// O nível muda devagar; ler a cada 30 s e mandar só quando muda poupa o rádio.
constexpr uint32_t BATTERY_PERIOD_MS = 30000;

// ---------------------------------------------------------------- tempo

// Debounce: um tátil quica por 1 a 5 ms. 8 ms fica abaixo de qualquer clique
// humano que importe e acima do quique.
constexpr uint32_t DEBOUNCE_MS = 8;

// Mesmo sem mudança, um report a cada 10 ms (~100 Hz): se um pacote se perde,
// o estado verdadeiro chega no seguinte em vez de ficar errado até o jogador
// mexer em algo.
constexpr uint32_t HEARTBEAT_MS = 10;

// ---------------------------------------------------------------- estado

struct DebouncedButton {
  bool stable;       // o estado que vai no report
  bool lastRaw;
  uint32_t changedAtMs;
};

DebouncedButton buttonState[BUTTON_COUNT];
int centerX = ADC_MAX / 2;
int centerY = ADC_MAX / 2;
int16_t lastX = AXIS_CENTER;
int16_t lastY = AXIS_CENTER;
uint32_t lastReportMs = 0;
uint32_t lastBatteryMs = 0;
uint8_t lastBatteryLevel = 255;

BleGamepad gamepad("shobu-controle", "shobu", 100);

// ---------------------------------------------------------------- analógico

int averageRead(uint8_t pin) {
  long sum = 0;
  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    sum += analogRead(pin);
    delay(2);
  }
  return static_cast<int>(sum / CALIBRATION_SAMPLES);
}

// Mapeia cada metade do curso separadamente: o centro não está no meio do
// ADC, e uma escala só faria um lado chegar ao fim antes do outro.
int16_t axisFromRaw(int raw, int center, bool invert) {
  int offset = raw - center;
  if (abs(offset) < DEAD_ZONE) return AXIS_CENTER;
  // a zona morta sai do curso, senão o eixo pula de 0 para 10% ao sair dela.
  float ratio = offset > 0
                    ? float(offset - DEAD_ZONE) / float(ADC_MAX - center - DEAD_ZONE)
                    : float(offset + DEAD_ZONE) / float(center - DEAD_ZONE);
  ratio = constrain(ratio, -1.0f, 1.0f);
  if (invert) ratio = -ratio;
  float half = ratio > 0 ? float(AXIS_MAX - AXIS_CENTER) : float(AXIS_CENTER - AXIS_MIN);
  return static_cast<int16_t>(AXIS_CENTER + ratio * half);
}

// ---------------------------------------------------------------- botões

// Devolve se o estado estável mudou.
bool updateButton(size_t index, uint32_t nowMs) {
  DebouncedButton& state = buttonState[index];
  bool pressed = digitalRead(BUTTONS[index].pin) == LOW;  // pull-up: apertado é LOW
  if (pressed != state.lastRaw) {
    state.lastRaw = pressed;
    state.changedAtMs = nowMs;
    return false;
  }
  if (pressed == state.stable || nowMs - state.changedAtMs < DEBOUNCE_MS) return false;
  state.stable = pressed;
  if (pressed) gamepad.press(BUTTONS[index].hidButton);
  else gamepad.release(BUTTONS[index].hidButton);
  return true;
}

bool updateButtons(uint32_t nowMs) {
  bool changed = false;
  for (size_t i = 0; i < BUTTON_COUNT; i++) changed |= updateButton(i, nowMs);
  return changed;
}

bool updateStick() {
  int16_t x = axisFromRaw(analogRead(PIN_STICK_X), centerX, INVERT_X);
  int16_t y = axisFromRaw(analogRead(PIN_STICK_Y), centerY, INVERT_Y);
  if (x == lastX && y == lastY) return false;
  lastX = x;
  lastY = y;
  gamepad.setX(x);
  gamepad.setY(y);
  return true;
}

// ---------------------------------------------------------------- bateria

// `analogReadMilliVolts` e não `analogRead`: o ADC do ESP32 é torto nas pontas,
// e a versão em milivolts aplica a calibração gravada de fábrica no chip.
uint8_t batteryLevel() {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(PIN_BATTERY);
  int packMv = static_cast<int>((sum / 16) * BATTERY_DIVIDER);
  int level = map(packMv, BATTERY_EMPTY_MV, BATTERY_FULL_MV, 0, 100);
  return static_cast<uint8_t>(constrain(level, 0, 100));
}

// O nível vai pelo serviço de bateria do BLE: o Android mostra no menu de
// Bluetooth, ao lado do nome do controle.
void updateBattery(uint32_t nowMs) {
  if (nowMs - lastBatteryMs < BATTERY_PERIOD_MS && lastBatteryLevel != 255) return;
  lastBatteryMs = nowMs;
  uint8_t level = batteryLevel();
  if (level == lastBatteryLevel) return;
  lastBatteryLevel = level;
  gamepad.setBatteryLevel(level);
  Serial.printf("{\"event\":\"battery\",\"level\":%u}\n", level);
}

// ---------------------------------------------------------------- setup/loop

void configureGamepad() {
  BleGamepadConfiguration config;
  // o report sai por conta própria, uma vez por loop: com autoReport cada
  // press/setX mandaria um pacote, e um movimento do analógico viraria dois.
  config.setAutoReport(false);
  config.setControllerType(CONTROLLER_TYPE_GAMEPAD);
  config.setButtonCount(16);
  config.setHatSwitchCount(0);
  // só X e Y: eixo declarado e parado aparece no Chrome como -1 ou 0 fixo, e
  // um eixo fantasma é o primeiro suspeito de "o personagem anda sozinho".
  config.setWhichAxes(true, true, false, false, false, false, false, false);
  config.setWhichSimulationControls(false, false, false, false, false);
  config.setAxesMin(AXIS_MIN);
  config.setAxesMax(AXIS_MAX);
  gamepad.begin(&config);
}

void setup() {
  // 80 MHz é o mínimo com que o rádio BLE funciona, e o controle não precisa de
  // mais: cada mA a menos é tempo de pilha.
  setCpuFrequencyMhz(80);
  Serial.begin(115200);
  analogReadResolution(12);
  // 11 dB: a faixa útil vai até ~3,1 V, o que cobre o curso inteiro em 3V3.
  analogSetAttenuation(ADC_11db);
  for (size_t i = 0; i < BUTTON_COUNT; i++) {
    pinMode(BUTTONS[i].pin, INPUT_PULLUP);
    buttonState[i] = {false, false, 0};
  }
  centerX = averageRead(PIN_STICK_X);
  centerY = averageRead(PIN_STICK_Y);
  Serial.printf("{\"event\":\"stick-calibrated\",\"centerX\":%d,\"centerY\":%d}\n", centerX, centerY);
  configureGamepad();
}

void loop() {
  uint32_t nowMs = millis();
  bool changed = updateButtons(nowMs);
  changed |= updateStick();
  updateBattery(nowMs);
  bool heartbeat = nowMs - lastReportMs >= HEARTBEAT_MS;
  if (gamepad.isConnected() && (changed || heartbeat)) {
    gamepad.sendReport();
    lastReportMs = nowMs;
  }
  // 1 ms: o laço não precisa girar mais rápido que o debounce consegue ler, e
  // ceder a cpu deixa a pilha BLE respirar.
  delay(1);
}

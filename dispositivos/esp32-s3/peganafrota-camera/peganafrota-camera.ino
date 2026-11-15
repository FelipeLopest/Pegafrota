// ESP32-S3, Arduino-ESP32 3.x, ArduinoJson 7.
// Pareamento uma vez por USB. Sem chave administrativa, sem HTTP inseguro ou OTA aberto.
#include <Arduino.h>
#include <WiFi.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <time.h>
#include <limits.h>
#include "esp_camera.h"
#include "img_converters.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "esp_random.h"
#include "perfis_camera.h"
#if !CONFIG_IDF_TARGET_ESP32S3
#error "Este firmware exige uma placa ESP32-S3."
#endif

const char *VERSAO = "pnf-s3-1.0.0";
const size_t LIMITE_JPEG = 307200;
Preferences preferencias;
String ssid, senha, endpoint, chave, perfil, entradaSerial;
bool espelhar=false, inverter=false, configurada=false, cameraPronta=false, discoPronto=false, bloqueada=false;
uint32_t proximaFoto=0, proximoEnvio=0, proximoSinal=0, proximaConexao=0;
uint32_t esperaEnvio=1000;
uint8_t anterior[432];
bool temAnterior=false;
bool filaComProblema=false;
String passagem;
int fotosRestantes=0;
uint32_t fimRajada=0;
float areaMovimento[4]={0,0,1,1};
int falhasCaptura=0;
uint32_t proximaInicializacao=0;

esp_err_t receberResposta(esp_http_client_event_t *evento) {
  if(evento->event_id==HTTP_EVENT_ON_DATA && evento->user_data) {
    String *resposta=static_cast<String*>(evento->user_data);
    if(resposta->length()+evento->data_len<=2048) resposta->concat(static_cast<const char*>(evento->data),evento->data_len);
  }
  return ESP_OK;
}

String uuidNovo() {
  uint8_t bytes[16]; esp_fill_random(bytes,sizeof(bytes));
  bytes[6]=(bytes[6]&0x0f)|0x40; bytes[8]=(bytes[8]&0x3f)|0x80;
  char valor[37];
  snprintf(valor,sizeof(valor),"%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5],bytes[6],bytes[7],bytes[8],bytes[9],bytes[10],bytes[11],bytes[12],bytes[13],bytes[14],bytes[15]);
  return String(valor);
}
bool chegou(uint32_t momento) { return static_cast<int32_t>(millis()-momento)>=0; }
bool relogioPronto() { return time(nullptr)>1700000000; }

bool endpointValido(const String &valor) {
  if (!valor.startsWith("https://") || valor.indexOf('@')>=0 || valor.indexOf('?')>=0 || valor.indexOf('#')>=0) return false;
  int fim=valor.indexOf('/',8);
  if(fim<0) return false;
  String host=valor.substring(8,fim);
  if(!host.endsWith(".supabase.co")) return false;
  for(size_t i=0;i<host.length();i++) if(!isAlphaNumeric(host[i]) && host[i]!='.' && host[i]!='-') return false;
  return valor.substring(fim)=="/functions/v1/camera-intake";
}

void configurarDisco() {
  discoPronto=LittleFS.begin(false);
  // Formatar automaticamente somente no primeiro pareamento de um dispositivo novo.
  if(!discoPronto && !configurada) { LittleFS.format(); discoPronto=LittleFS.begin(false); }
  if(discoPronto && !LittleFS.exists("/fila")) LittleFS.mkdir("/fila");
}

bool iniciarCamera() {
  if(!psramFound()) { Serial.println("ERRO: PSRAM ausente ou desabilitada. Confira as opções da placa."); return false; }
  camera_config_t config={};
  if(!aplicarPerfil(perfil,config)) { Serial.println("ERRO: identifique o modelo da placa antes de configurar os pinos."); return false; }
  config.ledc_channel=LEDC_CHANNEL_0; config.ledc_timer=LEDC_TIMER_0;
  config.xclk_freq_hz=20000000; config.pixel_format=PIXFORMAT_JPEG;
  config.frame_size=FRAMESIZE_VGA; config.jpeg_quality=12; config.fb_count=2;
  config.fb_location=CAMERA_FB_IN_PSRAM; config.grab_mode=CAMERA_GRAB_LATEST;
  if(esp_camera_init(&config)!=ESP_OK) { Serial.println("ERRO: inicializacao da camera. Confira modelo, cabo e PSRAM."); return false; }
  sensor_t *sensor=esp_camera_sensor_get();
  sensor->set_vflip(sensor,inverter?1:0); sensor->set_hmirror(sensor,espelhar?1:0);
  return true;
}

void aplicarPareamento(const String &texto) {
  JsonDocument dados;
  if(deserializeJson(dados,texto)) { Serial.println("ERRO: JSON de pareamento invalido."); return; }
  String novoEndpoint=dados["endpoint"]|"";
  String novaChave=dados["deviceKey"]|"";
  String novoSsid=dados["wifiSsid"]|"";
  String novaSenha=dados["wifiPassword"]|"";
  String novoPerfil=dados["boardProfile"]|"";
  camera_config_t teste={};
  if(!endpointValido(novoEndpoint) || novaChave.length()!=69 || !novaChave.startsWith("pnfc_") || novoSsid.length()<1 || novoSsid.length()>32 || novaSenha.length()>63 || !aplicarPerfil(novoPerfil,teste)) {
    Serial.println("ERRO: confira endpoint, chave, Wi-Fi e modelo exato da placa. Perfis: esp32s3-eye ou xiao-esp32s3-sense."); return;
  }
  for(size_t i=5;i<novaChave.length();i++) if(!isHexadecimalDigit(novaChave[i])) { Serial.println("ERRO: chave invalida."); return; }
  // Reparear nunca transmite fotos antigas para outra credencial/câmera/empresa.
  if(discoPronto && preferencias.getString("chave","")!=novaChave) {
    File diretorio=LittleFS.open("/fila"); File item=diretorio.openNextFile();
    while(item) { String nome=item.path(); item.close(); LittleFS.remove(nome); item=diretorio.openNextFile(); }
    diretorio.close();
  }
  preferencias.putString("ssid",novoSsid); preferencias.putString("senha",novaSenha);
  preferencias.putString("endpoint",novoEndpoint); preferencias.putString("chave",novaChave);
  preferencias.putString("perfil",novoPerfil);
  preferencias.putBool("espelhar",dados["horizontalMirror"]|false);
  preferencias.putBool("inverter",dados["verticalFlip"]|false);
  preferencias.putBool("configurada",true);
  Serial.println("Pareamento salvo. Reiniciando, sem exibir credenciais.");
  delay(300); ESP.restart();
}

void comandosUsb() {
  while(Serial.available()) {
    char letra=Serial.read();
    if(letra=='\r') continue;
    if(letra=='\n') {
      if(entradaSerial.startsWith("CONFIG ")) aplicarPareamento(entradaSerial.substring(7));
      else if(entradaSerial=="CAPTURAR" && cameraPronta) { passagem=uuidNovo(); fotosRestantes=3; Serial.println("Rajada de teste solicitada."); }
      else if(entradaSerial=="STATUS") Serial.printf("WiFi=%s camera=%s fila=%s bloqueada=%s\n",WiFi.status()==WL_CONNECTED?"conectada":"offline",cameraPronta?"pronta":"erro",discoPronto?"disponivel":"erro",bloqueada?"sim":"nao");
      else if(entradaSerial=="FORMATAR_FILA") { LittleFS.end(); LittleFS.format(); discoPronto=LittleFS.begin(false); if(discoPronto) LittleFS.mkdir("/fila"); Serial.println("Fila local apagada por comando explicito."); }
      else Serial.println("Comandos: CONFIG {json}, STATUS, CAPTURAR, FORMATAR_FILA (apaga capturas pendentes).");
      entradaSerial="";
    } else if(entradaSerial.length()<2048) entradaSerial+=letra;
    else { entradaSerial=""; Serial.println("ERRO: comando excede o limite."); }
  }
}

bool detectarMovimento(camera_fb_t *foto) {
  size_t tamanho=static_cast<size_t>(foto->width)*foto->height*3;
  uint8_t *rgb=static_cast<uint8_t*>(ps_malloc(tamanho));
  if(!rgb) return false;
  bool sucesso=fmt2rgb888(foto->buf,foto->len,PIXFORMAT_JPEG,rgb);
  if(!sucesso) { free(rgb); return false; }
  int alterados=0;
  for(int linha=0;linha<18;linha++) for(int coluna=0;coluna<24;coluna++) {
    size_t x=(areaMovimento[0]+(coluna+1)*(areaMovimento[2]-areaMovimento[0])/25)*foto->width;
    size_t y=(areaMovimento[1]+(linha+1)*(areaMovimento[3]-areaMovimento[1])/19)*foto->height;
    size_t posicao=(y*foto->width+x)*3, indice=linha*24+coluna;
    uint8_t cinza=(static_cast<int>(rgb[posicao])+rgb[posicao+1]+rgb[posicao+2])/3;
    if(temAnterior && abs(static_cast<int>(cinza)-anterior[indice])>18) alterados++;
    anterior[indice]=cinza;
  }
  free(rgb);
  bool movimento=temAnterior && alterados>65;
  temAnterior=true;
  return movimento;
}

bool salvarCaptura(camera_fb_t *foto) {
  if(!discoPronto || !relogioPronto() || foto->len>LIMITE_JPEG || LittleFS.totalBytes()-LittleFS.usedBytes()<foto->len+4096) return false;
  File diretorio=LittleFS.open("/fila"); int quantidade=0;
  File item=diretorio.openNextFile();
  while(item) { if(String(item.name()).endsWith(".json")) quantidade++; item.close(); item=diretorio.openNextFile(); }
  diretorio.close();
  if(quantidade>=6) return false;
  String evento=uuidNovo(), base="/fila/"+evento;
  File jpeg=LittleFS.open(base+".jpg","w");
  if(!jpeg || jpeg.write(foto->buf,foto->len)!=foto->len) { jpeg.close(); LittleFS.remove(base+".jpg"); return false; }
  jpeg.close();
  JsonDocument metadados; metadados["event"]=evento; metadados["passage"]=passagem; metadados["epoch"]=static_cast<long>(time(nullptr));
  File registro=LittleFS.open(base+".json","w");
  if(!registro) { LittleFS.remove(base+".jpg"); return false; }
  size_t escritos=serializeJson(metadados,registro); registro.close();
  if(!escritos) { LittleFS.remove(base+".json"); LittleFS.remove(base+".jpg"); return false; }
  return true;
}

int postar(const uint8_t *dados,size_t tamanho,const String &evento="",const String &grupo="",time_t horario=0) {
  esp_http_client_config_t config={};
  String resposta;
  config.url=endpoint.c_str(); config.crt_bundle_attach=esp_crt_bundle_attach;
  config.timeout_ms=15000; config.disable_auto_redirect=true;
  config.event_handler=receberResposta; config.user_data=&resposta;
  esp_http_client_handle_t cliente=esp_http_client_init(&config);
  if(!cliente) return -1;
  esp_http_client_set_method(cliente,HTTP_METHOD_POST);
  esp_http_client_set_header(cliente,"x-camera-key",chave.c_str());
  esp_http_client_set_header(cliente,"x-camera-version",VERSAO);
  const char *estado=!discoPronto?"storage_error":!cameraPronta?"camera_error":bloqueada?"unauthorized":filaComProblema?"queue_full":"ready";
  esp_http_client_set_header(cliente,"x-camera-status",estado);
  if(!dados) esp_http_client_set_header(cliente,"x-camera-heartbeat","1");
  else {
    char data[30]; struct tm utc; gmtime_r(&horario,&utc); strftime(data,sizeof(data),"%Y-%m-%dT%H:%M:%SZ",&utc);
    esp_http_client_set_header(cliente,"content-type","image/jpeg");
    esp_http_client_set_header(cliente,"x-camera-event",evento.c_str());
    esp_http_client_set_header(cliente,"x-camera-passage",grupo.c_str());
    esp_http_client_set_header(cliente,"x-camera-captured-at",data);
    esp_http_client_set_post_field(cliente,reinterpret_cast<const char*>(dados),tamanho);
  }
  esp_err_t resultado=esp_http_client_perform(cliente);
  int status=resultado==ESP_OK?esp_http_client_get_status_code(cliente):-1;
  esp_http_client_cleanup(cliente);
  if(!dados && status==200) {
    JsonDocument ajustes;
    if(!deserializeJson(ajustes,resposta) && ajustes["roi"].is<JsonArray>() && ajustes["roi"].size()==4) {
      float nova[4]; bool valida=true,mudou=false;
      for(int i=0;i<4;i++) { nova[i]=ajustes["roi"][i].as<float>(); if(!isfinite(nova[i])||nova[i]<0||nova[i]>1) valida=false; if(abs(nova[i]-areaMovimento[i])>0.001) mudou=true; }
      if(nova[2]-nova[0]<0.1 || nova[3]-nova[1]<0.1) valida=false;
      if(valida && mudou) { for(int i=0;i<4;i++) areaMovimento[i]=nova[i]; temAnterior=false; }
    }
  }
  return status;
}

void enviarFila() {
  if(!discoPronto || bloqueada) return;
  File diretorio=LittleFS.open("/fila"); File item=diretorio.openNextFile();
  String escolhido=""; long maisAntigo=LONG_MAX;
  while(item) {
    String nome=item.name();
    if(nome.endsWith(".json")) {
      JsonDocument meta;
      if(!deserializeJson(meta,item)) { long epoca=meta["epoch"]|0L; if(epoca<maisAntigo) { maisAntigo=epoca; escolhido=nome; } }
    }
    item.close(); item=diretorio.openNextFile();
  }
  diretorio.close();
  if(!escolhido.length()) return;
  if(!escolhido.startsWith("/")) escolhido="/fila/"+escolhido;
  File registro=LittleFS.open(escolhido,"r"); JsonDocument meta;
  if(deserializeJson(meta,registro)) { registro.close(); return; } registro.close();
  String base=escolhido.substring(0,escolhido.length()-5);
  if(time(nullptr)-maisAntigo>900) { LittleFS.remove(base+".jpg"); LittleFS.remove(escolhido); Serial.println("Captura pendente expirada: conferir movimentacao manual."); return; }
  File foto=LittleFS.open(base+".jpg","r");
  if(!foto || foto.size()>LIMITE_JPEG || foto.size()<4) { foto.close(); LittleFS.remove(base+".jpg"); LittleFS.remove(escolhido); return; }
  size_t tamanho=foto.size(); uint8_t *dados=static_cast<uint8_t*>(ps_malloc(tamanho));
  if(!dados) { foto.close(); return; }
  if(foto.read(dados,tamanho)!=tamanho) { free(dados); foto.close(); return; } foto.close();
  int status=postar(dados,tamanho,meta["event"].as<String>(),meta["passage"].as<String>(),maisAntigo);
  free(dados);
  if(status==200 || status==202 || status==400 || status==413 || status==415) {
    LittleFS.remove(base+".jpg"); LittleFS.remove(escolhido); esperaEnvio=1000;
    filaComProblema=false;
    Serial.printf("Captura: HTTP %d\n",status);
  } else {
    esperaEnvio=min(static_cast<uint32_t>(60000),esperaEnvio*2);
    if(status==401 || status==403) { bloqueada=true; Serial.println("Chave revogada/invalida: refaca o pareamento USB."); }
    else Serial.printf("Envio pendente: HTTP %d. Reenvio com o mesmo identificador.\n",status);
  }
}

void setup() {
  Serial.begin(115200); preferencias.begin("peganafrota",false);
  configurada=preferencias.getBool("configurada",false);
  configurarDisco();
  ssid=preferencias.getString("ssid",""); senha=preferencias.getString("senha","");
  endpoint=preferencias.getString("endpoint",""); chave=preferencias.getString("chave",""); perfil=preferencias.getString("perfil","");
  espelhar=preferencias.getBool("espelhar",false); inverter=preferencias.getBool("inverter",false);
  if(!configurada) { Serial.println("PegaNaFrota: identifique o modelo e envie CONFIG {json} pelo USB. Nenhuma captura sera feita sem pareamento."); return; }
  cameraPronta=iniciarCamera(); WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(ssid.c_str(),senha.c_str());
  configTime(0,0,"pool.ntp.org","time.google.com");
}

void loop() {
  comandosUsb();
  if(!configurada) { delay(10); return; }
  if(WiFi.status()!=WL_CONNECTED && chegou(proximaConexao)) { WiFi.reconnect(); proximaConexao=millis()+15000; }
  if(!cameraPronta && chegou(proximaInicializacao)) { cameraPronta=iniciarCamera(); falhasCaptura=0; proximaInicializacao=millis()+30000; }
  if(cameraPronta && relogioPronto() && !bloqueada && chegou(proximaFoto)) {
    camera_fb_t *foto=esp_camera_fb_get();
    if(foto) {
      falhasCaptura=0;
      bool movimento=detectarMovimento(foto);
      if(fotosRestantes==0 && movimento && chegou(fimRajada)) { passagem=uuidNovo(); fotosRestantes=3; }
      if(fotosRestantes>0) {
        if(!salvarCaptura(foto)) { filaComProblema=true; Serial.println("Fila local indisponivel/cheia: conferir STATUS."); }
        else filaComProblema=false;
        fotosRestantes--; if(fotosRestantes==0) fimRajada=millis()+1500;
      }
      esp_camera_fb_return(foto);
    } else if(++falhasCaptura>=3) { esp_camera_deinit(); cameraPronta=false; proximaInicializacao=millis()+30000; Serial.println("Falha de captura. Camera sera reinicializada."); }
    proximaFoto=millis()+1000;
  }
  if(WiFi.status()==WL_CONNECTED && relogioPronto()) {
    if(chegou(proximoSinal)) { int estado=postar(nullptr,0); if(estado==200) bloqueada=false; else if(estado==401 || estado==403) { bloqueada=true; fotosRestantes=0; } proximoSinal=millis()+30000; proximoEnvio=max(proximoEnvio,millis()+1000); }
    if(chegou(proximoEnvio)) { enviarFila(); proximoEnvio=millis()+esperaEnvio; }
  }
  delay(10);
}

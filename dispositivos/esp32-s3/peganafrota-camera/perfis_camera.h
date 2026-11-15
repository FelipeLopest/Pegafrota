#pragma once
#include "esp_camera.h"

// Referência: exemplos CameraWebServer/camera_pins.h da Espressif.
// Seleção explícita no pareamento: não usar esses pinos em outra placa por suposição.
inline bool aplicarPerfil(const String &perfil, camera_config_t &configuracao) {
  configuracao.pin_pwdn = -1;
  configuracao.pin_reset = -1;
  if (perfil == "esp32s3-eye") {
    configuracao.pin_xclk=15; configuracao.pin_sccb_sda=4; configuracao.pin_sccb_scl=5;
    configuracao.pin_d0=11; configuracao.pin_d1=9; configuracao.pin_d2=8; configuracao.pin_d3=10;
    configuracao.pin_d4=12; configuracao.pin_d5=18; configuracao.pin_d6=17; configuracao.pin_d7=16;
    configuracao.pin_vsync=6; configuracao.pin_href=7; configuracao.pin_pclk=13;
    return true;
  }
  if (perfil == "xiao-esp32s3-sense") {
    configuracao.pin_xclk=10; configuracao.pin_sccb_sda=40; configuracao.pin_sccb_scl=39;
    configuracao.pin_d0=15; configuracao.pin_d1=17; configuracao.pin_d2=18; configuracao.pin_d3=16;
    configuracao.pin_d4=14; configuracao.pin_d5=12; configuracao.pin_d6=11; configuracao.pin_d7=48;
    configuracao.pin_vsync=38; configuracao.pin_href=47; configuracao.pin_pclk=13;
    return true;
  }
  return false;
}

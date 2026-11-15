import base64
import unittest
from reconhecer_placa import extrair_placas, validar_imagem


def caixa(texto, confianca=0.96, x=0, y=0, largura=140):
    return ([[x,y],[x+largura,y],[x+largura,y+20],[x,y+20]], texto, confianca)


class TestesReconhecimento(unittest.TestCase):
    def test_placas_brasileiras(self):
        self.assertEqual(extrair_placas([caixa("ABC-1234"), caixa("DEF1G23", y=80)]), [("ABC1234",0.96),("DEF1G23",0.96)])

    def test_caracteres_separados(self):
        itens = [caixa(letra, x=indice*18, largura=15) for indice,letra in enumerate("ABC1D23")]
        self.assertEqual(extrair_placas(itens), [("ABC1D23",0.96)])

    def test_nao_adivinha_placa(self):
        self.assertEqual(extrair_placas([caixa("ABCI234"),caixa("EMPRESA",y=80)]), [])

    def test_nao_junta_linhas_distantes(self):
        self.assertEqual(extrair_placas([caixa("ABC",x=0),caixa("1234",x=600)]), [])

    def test_rejeita_imagem_roi_e_base64_invalidos(self):
        for pedido in [{}, {"jpegBase64":"invalido"}, {"jpegBase64":base64.b64encode(b"nao-jpeg").decode()},
                       {"jpegBase64":base64.b64encode(b"\xff\xd8\xff\xd9").decode(),"roi":[0,0,-1,1]}]:
            with self.assertRaises((ValueError,TypeError)):
                validar_imagem(pedido)


if __name__ == "__main__":
    unittest.main()

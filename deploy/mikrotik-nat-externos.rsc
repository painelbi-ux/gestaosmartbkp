# =============================================================================
# LEGADO — NAT só com in-interface=WAN: costuma FALHAR para PCs na LAN acessando
# o domínio/IP público. Use em vez disso:
#   deploy\mikrotik-nat-unificado-hairpin.rsc
# Leia: deploy\MIKROTIK-ACESSO-INTERNO.txt
# =============================================================================
#
# OPCIONAL — acesso sem :porta no browser (http://dominio/ usa 80 no WAN):
# Encaminha WAN:80 -> PC na porta do Vite (5173 = instância "externa" do npm run dev;
# use 5180 se quiser o mesmo fluxo da instância "interna"). O Vite continua na porta
# escolhida; nada precisa escutar na 80 no Windows para quem vem pela WAN.
# Cuidado: se Let's Encrypt HTTP-01 na 80 for para OUTRO serviço, não use esta regra.

/ip firewall nat add chain=dstnat protocol=tcp dst-port=80 in-interface=ether1-WAN \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5173 comment="Gestor HTTP 80 para Vite 5173" hairpin-nat=yes

/ip firewall nat add chain=dstnat protocol=tcp dst-port=5173 in-interface=ether1-WAN \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5173 comment="Gestor 5173" hairpin-nat=yes

/ip firewall nat add chain=dstnat protocol=tcp dst-port=5174 in-interface=ether1-WAN \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5174 comment="Gestor 5174" hairpin-nat=yes

/ip firewall nat add chain=dstnat protocol=tcp dst-port=5051 in-interface=ether1-WAN \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5051 comment="Gestor 5051" hairpin-nat=yes

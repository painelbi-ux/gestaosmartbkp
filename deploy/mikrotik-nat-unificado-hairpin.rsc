# =============================================================================
# NAT unificado: internet + LAN pelo mesmo IP público (hairpin / NAT loopback)
# =============================================================================
# PROBLEMA: dstnat com in-interface=WAN NÃO aplica a PCs da LAN que acessam o IP público.
# SOLUÇÃO: dst-address=<IP_PUBLICO> (sem fixar in-interface na WAN).
#
# AJUSTE os IPs abaixo se o seu público ou o servidor LAN forem diferentes.
# Remova regras dstnat antigas duplicadas (mesmas portas) antes de importar.
#
# IP público (registro A na Hostinger): 170.84.146.147
# Servidor Gestor na LAN: 10.80.1.187

/ip firewall nat add chain=dstnat protocol=tcp dst-address=170.84.146.147 dst-port=80 \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5180 \
    comment="Gestor:80->5180 WAN+LAN hairpin" hairpin-nat=yes

/ip firewall nat add chain=dstnat protocol=tcp dst-address=170.84.146.147 dst-port=5180 \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5180 \
    comment="Gestor:5180 hairpin" hairpin-nat=yes

/ip firewall nat add chain=dstnat protocol=tcp dst-address=170.84.146.147 dst-port=5173 \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5173 \
    comment="Gestor:5173 hairpin" hairpin-nat=yes

/ip firewall nat add chain=dstnat protocol=tcp dst-address=170.84.146.147 dst-port=5174 \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5174 \
    comment="Gestor:5174 hairpin" hairpin-nat=yes

/ip firewall nat add chain=dstnat protocol=tcp dst-address=170.84.146.147 dst-port=5051 \
    action=dst-nat to-addresses=10.80.1.187 to-ports=5051 \
    comment="Gestor:5051 hairpin" hairpin-nat=yes

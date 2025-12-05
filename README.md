# BAR APP - TAMPICO GESTION PARA BARES Y RESTAURANTES

INTEGRANTES DEL PROYECTO:
CARRIZALES CASTILLO ROBERTO ROEL
JUAN MANUEL OSORIO BUENO

APLICACION WEB PROGRESIVA

Es una app web diseñada para optimizar la operacion de un bar o restaurante.
Incluye modulos para clientes, meseros y administradores con un backend a una base de datos de "render.com" y frontend ligero en **html, css y javascript**

Las caracteristicas principales que posee este proyecto en su logica son:

El apartado de "clientes"

-Se podra visualizar la carta digital del bar, tanto de forma estatica entrando a la pagina, si entra escaneando el QR de la mesa, y podra pedir su pedido en el apartado de cliente.

En "Meseros"

-Se tiene un panel de control para registrar las ordenes de los clientes y gestionar a que mesa ira la orden, estos solo podran registrar si el pago ya fue entregado, si no es asi, los meseros no podran generar el ticket al "cerrar la cuenta"

En "admin"


La arquitectura del proyecto se dividio en dos partes por el compañero osorio
Uno se llama barapp-frontend y barapp-backend.

En el **frontend** utilizamos lenguajes como HTML, JS Y CSS para el diseño, la logica de validacion de usuarios vinculandolo con la api url donde esta alojada la base de datos en Render.com, junto con endpoints para separar la ubicacion de cada pagina.

En el **backend** las tecnologias utilizadas son Node.js, sqlite 3 (Almacenado en render.com para hosting) alli se tiene la logica de la pagina, teniendo autenticacion, usuarios, productos, ordenes y mesas.

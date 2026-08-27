/**
 * Trazaloop · QUALITY-12.2C · `server-only`, neutralizado para la prueba de UI.
 *
 * El paquete real lanza una excepción al importarse desde un módulo de
 * cliente, que es su trabajo: impide que código de servidor acabe en el
 * navegador. Aquí no hay navegador ni servidor, solo un DOM en memoria y un
 * componente al que hay que pulsarle un botón.
 *
 * El componente importa la acción de servidor porque es su valor por omisión;
 * la prueba le inyecta otra y nunca la ejecuta. Neutralizar el guarda SOLO en
 * esta configuración de pruebas no debilita nada: el `tsconfig` de la
 * aplicación no lo conoce.
 */
export {};

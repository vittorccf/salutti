// Endereço para exibir (seguro em componente cliente: nada de módulo só de servidor aqui).
export const formatAddress = (a: {
  street?: string | null;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}) => {
  const line1 = [a.street, a.addressNumber].filter(Boolean).join(", ");
  const parts = [line1, a.complement, a.district, [a.city, a.state].filter(Boolean).join("/"), a.cep?.replace(/^(\d{5})(\d{3})$/, "$1-$2")];
  return parts.filter(Boolean).join(" · ") || null;
};

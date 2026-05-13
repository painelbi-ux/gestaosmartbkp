import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface LayoutFocoContextValue {
  /** Quando true o header e a barra de abas estão ocultos (modo foco). */
  modoFoco: boolean;
  alternarModoFoco: () => void;
  sairModoFoco: () => void;
}

const LayoutFocoContext = createContext<LayoutFocoContextValue>({
  modoFoco: false,
  alternarModoFoco: () => {},
  sairModoFoco: () => {},
});

export function LayoutFocoProvider({ children }: { children: ReactNode }) {
  const [modoFoco, setModoFoco] = useState(false);

  const alternarModoFoco = useCallback(() => setModoFoco((v) => !v), []);
  const sairModoFoco = useCallback(() => setModoFoco(false), []);

  return (
    <LayoutFocoContext.Provider value={{ modoFoco, alternarModoFoco, sairModoFoco }}>
      {children}
    </LayoutFocoContext.Provider>
  );
}

export function useLayoutFoco() {
  return useContext(LayoutFocoContext);
}

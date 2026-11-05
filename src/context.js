import { createContext, useContext } from 'react';

export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

export const ROUTES = [
  { id: 'po', label: 'Purchase Orders' },
  { id: 'inbound', label: 'Inbound' },
  { id: 'inventory', label: 'Inventory & Aging' },
  { id: 'outbound', label: 'Outbound' },
  { id: 'costs', label: 'Costs' },
];

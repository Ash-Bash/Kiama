import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ModalContextType {
  openModal: (content: ReactNode, options?: ModalOptions) => void;
  closeModal: () => void;
  isOpen: boolean;
  modalContent: ReactNode | null;
}

interface ModalOptions {
  size?: 'small' | 'medium' | 'large';
  closable?: boolean;
  title?: string;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

interface ModalProviderProps {
  children: ReactNode;
}

export const ModalProvider: React.FC<ModalProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalContent, setModalContent] = useState<ReactNode | null>(null);
  const [modalOptions, setModalOptions] = useState<ModalOptions>({});

  const openModal = (content: ReactNode, options: ModalOptions = {}) => {
    setModalContent(content);
    setModalOptions(options);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setModalContent(null);
    setModalOptions({});
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && modalOptions.closable !== false) {
      closeModal();
    }
  };

  return (
    <ModalContext.Provider value={{ openModal, closeModal, isOpen, modalContent }}>
      {children}
      {isOpen && (
        <div className="modal-overlay" onClick={handleBackdropClick}>
          <div className={`modal-content ${modalOptions.size || 'medium'}`}>
            {modalOptions.title && (
              <div className="modal-header">
                <h2>{modalOptions.title}</h2>
                {modalOptions.closable !== false && (
                  <button className="modal-close" onClick={closeModal}>×</button>
                )}
              </div>
            )}
            <div className="modal-body">
              {modalContent}
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};
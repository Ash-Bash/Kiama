import React from 'react';

interface PageProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  scroll?: boolean;
}

// Lightweight layout wrapper that adds optional header and padding classes.
const Page: React.FC<PageProps> = ({
  header,
  children,
  className = '',
  bodyClassName = '',
  padded = false,
  scroll = false,
}) => {
  const bodyClasses = [
    'page-body',
    padded ? 'page-body--padded' : '',
    scroll ? 'page-body--scroll' : '',
    bodyClassName
  ].filter(Boolean).join(' ');

  return (
    <div className={`page ${className}`.trim()}>
      {header && <div className="page-header">{header}</div>}
      <div className={bodyClasses}>
        {children}
      </div>
    </div>
  );
};

export default Page;

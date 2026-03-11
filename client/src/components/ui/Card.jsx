import { clsx } from 'clsx';

const Card = ({ className, children, ...props }) => {
  return (
    <div className={clsx('card', className)} {...props}>
      {children}
    </div>
  );
};

const CardHeader = ({ className, children, ...props }) => (
  <div className={clsx('card-header', className)} {...props}>
    {children}
  </div>
);

const CardBody = ({ className, children, ...props }) => (
  <div className={clsx('card-body', className)} {...props}>
    {children}
  </div>
);

const CardFooter = ({ className, children, ...props }) => (
  <div className={clsx('card-footer', className)} {...props}>
    {children}
  </div>
);

export { Card, CardHeader, CardBody, CardFooter };

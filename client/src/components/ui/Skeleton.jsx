import { motion } from 'framer-motion';
import { clsx } from 'clsx';

const Skeleton = ({ className, variant = 'text', width, height, ...props }) => {
  const styles = {
    width: width || '100%',
    height: height || (variant === 'text' ? '1rem' : '100%'),
    backgroundColor: 'rgba(184, 156, 132, 0.2)',
    borderRadius: variant === 'circle' ? '50%' : 'var(--radius-sm)',
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <div className={clsx('skeleton', className)} style={styles} {...props}>
      <motion.div
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
        }}
      />
    </div>
  );
};

export { Skeleton };

import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^\S+@\S+\.\S+$/.test(v);
      },
      message: props => `${props.value} is not a valid email!`
    }
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
}, {
  timestamps: true, 
});

const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

export default Contact;

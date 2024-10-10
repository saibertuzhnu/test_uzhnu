class Order {
    constructor(customer, items) {
        this.customer = customer;
        this.items = items;
    }

    getCustomerDetails() {
        console.log("Customer name: " + this.customer.name);
        console.log("Customer address: " + this.customer.address);
    }

    calculateTotalPrice() {
        let total = 0;
        for (let i = 0; i < this.items.length; i++) {
            total += this.items[i].price * this.items[i].quantity;
        }
        return total;
    }

    processOrder() {
        let array = [];

        if (this.items.length > 0) {
            console.log("Processing order for " + this.customer.name);
            let total = this.calculateTotalPrice();
            console.log("Total price: " + total);
            if (total > 100) {
                console.log("Apply discount");
                total = total * 0.9;
            }
            console.log("Final price: " + total);
        } else {
            console.log("Order has no items.");
        }
    }
}

const customer = { name: "John Doe", address: "123 Main St" };
const items = [
    { name: "Laptop", price: 1000, quantity: 1 },
    { name: "Mouse", price: 25, quantity: 2 }
];

const order = new Order(customer, items);
order.processOrder();

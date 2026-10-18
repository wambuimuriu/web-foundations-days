# Library API Design

A REST API for a library's **books** resource. The URL names the resource and the HTTP method says what to do with it. All request and response bodies use JSON.

## Endpoints

### 1. List all books
- **Method:** GET
- **Path:** `/books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** 200 OK

### 2. Get one book
- **Method:** GET
- **Path:** `/books/{id}` (for example `/books/7`)
- **Description:** Returns the single book with that id.
- **Request body:** none
- **Success status:** 200 OK

### 3. Create a book
- **Method:** POST
- **Path:** `/books`
- **Description:** Adds a new book to the library.
- **Example request body:**
```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958,
    "isbn": "9780385474542"
  }
```
- **Success status:** 201 Created

### 4. Update a book
- **Method:** PUT
- **Path:** `/books/{id}`
- **Description:** Replaces the details of an existing book.
- **Example request body:**
```json
  {
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "year": 1958,
    "isbn": "9780385474542"
  }
```
- **Success status:** 200 OK

### 5. Delete a book
- **Method:** DELETE
- **Path:** `/books/{id}`
- **Description:** Removes the book with that id.
- **Request body:** none
- **Success status:** 204 No Content

### 6. List books by an author
- **Method:** GET
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the author given in the query parameter.
- **Request body:** none
- **Success status:** 200 OK

## Error codes

- **400 Bad Request**
  - The request is invalid or incomplete.
  - Example: `POST /books` with a body that is missing the `title`, or where `year` is text instead of a number.
- **404 Not Found**
  - The requested resource does not exist.
  - Example: `GET /books/999` when no book has the id 999.